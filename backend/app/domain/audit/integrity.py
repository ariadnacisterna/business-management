from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import RowMapping, text
from sqlalchemy.orm import Session

from app.constants.status import SHORTAGE_OPEN_STATUSES
from app.domain.catalog.stock import format_quantity

CONSTRAINT_DESCRIPTIONS = {
    "ck_stock_movement_quantity_changed": "cada movimiento de stock tiene que cambiar la cantidad",
    "ck_price_effective_range": "un precio no puede terminar antes de empezar",
}

OPEN_SHORTAGE_STATUSES_SQL = ", ".join(f"'{status}'" for status in SHORTAGE_OPEN_STATUSES)

VARIANT_CONTEXT = """
    SELECT v.id AS variant_id, b.name AS business_name, p.name AS product_name,
           v.label AS variant_label
    FROM variant v
    JOIN product p ON p.id = v.product_id
    JOIN business b ON b.id = p.business_id
"""


@dataclass(frozen=True)
class IntegrityProblem:
    business_name: str | None
    description: str


def _variant_subject(product_name: str, variant_label: str | None) -> str:
    subject = f'Producto "{product_name}"'
    if variant_label:
        subject += f' (variante "{variant_label}")'
    return subject


def _format_moment(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S") + " (hora UTC)"


def _format_amount(amount: Decimal) -> str:
    return f"$ {amount}"


def _variant_problems(
    db: Session, query: str, describe: Callable[[RowMapping], str]
) -> list[IntegrityProblem]:
    rows = db.execute(text(f"WITH context AS ({VARIANT_CONTEXT}) {query}")).mappings().all()
    return [
        IntegrityProblem(
            row["business_name"],
            f"{_variant_subject(row['product_name'], row['variant_label'])}: {describe(row)}",
        )
        for row in rows
    ]


def _duplicate_current_prices(db: Session) -> list[IntegrityProblem]:
    rows = db.execute(
        text(
            f"""
            WITH context AS ({VARIANT_CONTEXT})
            SELECT b.name AS business_name, c.product_name, c.variant_label,
                   count(*) AS current_count
            FROM price pr
            JOIN context c ON c.variant_id = pr.variant_id
            JOIN business b ON b.id = pr.business_id
            WHERE pr.effective_to IS NULL
            GROUP BY b.name, pr.business_id, c.product_name, c.variant_label, pr.variant_id
            HAVING count(*) > 1
            ORDER BY b.name, c.product_name
            """
        )
    ).mappings()
    return [
        IntegrityProblem(
            row["business_name"],
            f"{_variant_subject(row['product_name'], row['variant_label'])}: tiene "
            f"{row['current_count']} precios vigentes a la vez (tiene que haber uno solo).",
        )
        for row in rows
    ]


def _non_positive_prices(db: Session) -> list[IntegrityProblem]:
    return _variant_problems(
        db,
        """
        SELECT c.*, pr.amount, pr.effective_from
        FROM price pr JOIN context c ON c.variant_id = pr.variant_id
        WHERE pr.amount <= 0
        ORDER BY c.business_name, c.product_name, pr.effective_from
        """,
        lambda row: (
            f"tiene un precio de {_format_amount(row['amount'])} desde el "
            f"{_format_moment(row['effective_from'])}; un precio tiene que ser mayor que cero."
        ),
    )


def _inverted_price_periods(db: Session) -> list[IntegrityProblem]:
    return _variant_problems(
        db,
        """
        SELECT c.*, pr.effective_from, pr.effective_to
        FROM price pr JOIN context c ON c.variant_id = pr.variant_id
        WHERE pr.effective_to < pr.effective_from
        ORDER BY c.business_name, c.product_name, pr.effective_from
        """,
        lambda row: (
            f"un precio termina el {_format_moment(row['effective_to'])}, antes de empezar "
            f"el {_format_moment(row['effective_from'])}."
        ),
    )


def _prices_of_another_business(db: Session) -> list[IntegrityProblem]:
    return _variant_problems(
        db,
        """
        SELECT c.*, other.name AS price_business_name
        FROM price pr
        JOIN context c ON c.variant_id = pr.variant_id
        JOIN variant v ON v.id = pr.variant_id
        JOIN product p ON p.id = v.product_id
        JOIN business other ON other.id = pr.business_id
        WHERE pr.business_id <> p.business_id
        ORDER BY c.business_name, c.product_name
        """,
        lambda row: (
            f'tiene un precio cargado en otro negocio ("{row["price_business_name"]}"); '
            "el precio tiene que ser del mismo negocio que el producto."
        ),
    )


def _price_history_gaps(db: Session) -> list[IntegrityProblem]:
    return _variant_problems(
        db,
        """
        , ordered AS (
            SELECT pr.variant_id, pr.effective_to,
                   lead(pr.effective_from) OVER (
                       PARTITION BY pr.variant_id, pr.business_id
                       ORDER BY pr.effective_from, pr.id
                   ) AS next_effective_from
            FROM price pr
        )
        SELECT c.*, o.effective_to, o.next_effective_from
        FROM ordered o JOIN context c ON c.variant_id = o.variant_id
        WHERE o.next_effective_from IS NOT NULL
          AND o.effective_to IS DISTINCT FROM o.next_effective_from
        ORDER BY c.business_name, c.product_name, o.next_effective_from
        """,
        lambda row: (
            "el historial de precios no es continuo: un precio "
            + (
                "sigue vigente"
                if row["effective_to"] is None
                else f"termina el {_format_moment(row['effective_to'])}"
            )
            + f" pero el siguiente empieza el {_format_moment(row['next_effective_from'])}."
        ),
    )


def _negative_stock(db: Session) -> list[IntegrityProblem]:
    return _variant_problems(
        db,
        """
        SELECT c.*, v.quantity, v.minimum_quantity
        FROM variant v JOIN context c ON c.variant_id = v.id
        WHERE v.quantity < 0 OR v.minimum_quantity < 0
        ORDER BY c.business_name, c.product_name
        """,
        lambda row: (
            f"el stock ({format_quantity(row['quantity'])}) o el stock mínimo "
            f"({format_quantity(row['minimum_quantity'] or Decimal(0))}) es negativo."
        ),
    )


def _fractional_stock_in_whole_units(db: Session) -> list[IntegrityProblem]:
    return _variant_problems(
        db,
        """
        SELECT c.*, v.quantity, v.minimum_quantity, u.name AS unit_name
        FROM variant v
        JOIN context c ON c.variant_id = v.id
        JOIN product p ON p.id = v.product_id
        JOIN unit u ON u.id = p.unit_id
        WHERE NOT u.allows_fraction
          AND (v.quantity <> trunc(v.quantity) OR v.minimum_quantity <> trunc(v.minimum_quantity))
        ORDER BY c.business_name, c.product_name
        """,
        lambda row: (
            f'se vende por "{row["unit_name"]}", que no admite decimales, pero tiene stock '
            f"{format_quantity(row['quantity'])} y stock mínimo "
            f"{format_quantity(row['minimum_quantity'] or Decimal(0))}."
        ),
    )


def _invalid_movements(db: Session) -> list[IntegrityProblem]:
    return _variant_problems(
        db,
        """
        SELECT c.*, m.quantity_before, m.quantity_after, m.created_at
        FROM stock_movement m JOIN context c ON c.variant_id = m.variant_id
        WHERE m.quantity_before < 0 OR m.quantity_after < 0
           OR m.quantity_before = m.quantity_after
        ORDER BY c.business_name, c.product_name, m.id
        """,
        lambda row: (
            f"el movimiento de stock del {_format_moment(row['created_at'])} pasa de "
            f"{format_quantity(row['quantity_before'])} a {format_quantity(row['quantity_after'])}"
            "; tiene que cambiar la cantidad y no puede dejarla negativa."
        ),
    )


def _broken_stock_chains(db: Session) -> list[IntegrityProblem]:
    return _variant_problems(
        db,
        """
        , ordered AS (
            SELECT m.variant_id, m.quantity_before, m.created_at,
                   lag(m.quantity_after) OVER (PARTITION BY m.variant_id ORDER BY m.id)
                       AS previous_quantity_after
            FROM stock_movement m
        )
        SELECT c.*, o.quantity_before, o.created_at,
               coalesce(o.previous_quantity_after, 0) AS expected_quantity_before,
               o.previous_quantity_after IS NULL AS is_first
        FROM ordered o JOIN context c ON c.variant_id = o.variant_id
        WHERE o.quantity_before <> coalesce(o.previous_quantity_after, 0)
        ORDER BY c.business_name, c.product_name, o.created_at
        """,
        lambda row: (
            f"el movimiento de stock del {_format_moment(row['created_at'])} arranca en "
            f"{format_quantity(row['quantity_before'])}, pero "
            + (
                "el primer movimiento tiene que arrancar en 0."
                if row["is_first"]
                else "el movimiento anterior había dejado "
                f"{format_quantity(row['expected_quantity_before'])}."
            )
        ),
    )


def _stock_not_matching_last_movement(db: Session) -> list[IntegrityProblem]:
    return _variant_problems(
        db,
        """
        , last_movement AS (
            SELECT DISTINCT ON (m.variant_id) m.variant_id, m.quantity_after
            FROM stock_movement m
            ORDER BY m.variant_id, m.id DESC
        )
        SELECT c.*, v.quantity,
               coalesce(l.quantity_after, 0) AS expected_quantity,
               l.variant_id IS NULL AS has_no_movements
        FROM variant v
        JOIN context c ON c.variant_id = v.id
        LEFT JOIN last_movement l ON l.variant_id = v.id
        WHERE v.quantity <> coalesce(l.quantity_after, 0)
        ORDER BY c.business_name, c.product_name
        """,
        lambda row: (
            f"el stock actual es {format_quantity(row['quantity'])}, pero "
            + (
                "no tiene ningún movimiento de stock que lo explique (tendría que ser 0)."
                if row["has_no_movements"]
                else f"el último movimiento lo dejó en {format_quantity(row['expected_quantity'])}."
            )
        ),
    )


def _products_without_variants(db: Session) -> list[IntegrityProblem]:
    rows = db.execute(
        text(
            """
            SELECT b.name AS business_name, p.name AS product_name
            FROM product p
            JOIN business b ON b.id = p.business_id
            WHERE NOT EXISTS (SELECT 1 FROM variant v WHERE v.product_id = p.id)
            ORDER BY b.name, p.name
            """
        )
    ).mappings()
    return [
        IntegrityProblem(
            row["business_name"],
            f'Producto "{row["product_name"]}": no tiene ninguna variante (tiene que tener al '
            "menos una).",
        )
        for row in rows
    ]


def _duplicate_open_shortages(db: Session) -> list[IntegrityProblem]:
    return _variant_problems(
        db,
        f"""
        SELECT c.*, count(*) AS open_count
        FROM shortage s JOIN context c ON c.variant_id = s.variant_id
        WHERE s.status IN ({OPEN_SHORTAGE_STATUSES_SQL})
        GROUP BY c.variant_id, c.business_name, c.product_name, c.variant_label
        HAVING count(*) > 1
        ORDER BY c.business_name, c.product_name
        """,
        lambda row: (
            f"tiene {row['open_count']} faltantes abiertos a la vez (puede haber uno solo)."
        ),
    )


def _non_positive_credits(db: Session) -> list[IntegrityProblem]:
    rows = db.execute(
        text(
            """
            SELECT b.name AS business_name, cu.name AS customer_name, cr.amount, cr.created_at
            FROM credit cr
            JOIN customer cu ON cu.id = cr.customer_id
            JOIN business b ON b.id = cu.business_id
            WHERE cr.amount <= 0
            ORDER BY b.name, cu.name, cr.created_at
            """
        )
    ).mappings()
    return [
        IntegrityProblem(
            row["business_name"],
            f'Cliente "{row["customer_name"]}": el movimiento del '
            f"{_format_moment(row['created_at'])} tiene un importe de "
            f"{_format_amount(row['amount'])}; tiene que ser mayor que cero.",
        )
        for row in rows
    ]


def _unvalidated_constraints(db: Session) -> list[IntegrityProblem]:
    rows = db.execute(
        text(
            """
            SELECT conname AS constraint_name
            FROM pg_constraint
            WHERE NOT convalidated AND connamespace = 'public'::regnamespace
            ORDER BY conname
            """
        )
    ).mappings()
    return [
        IntegrityProblem(
            None,
            "La regla de la base "
            f'"{CONSTRAINT_DESCRIPTIONS.get(row["constraint_name"], row["constraint_name"])}" '
            "todavía no se comprueba sobre los datos viejos, porque había datos que no la "
            "cumplían cuando se agregó. Los datos nuevos sí la cumplen.",
        )
        for row in rows
    ]


CHECKS = (
    _duplicate_current_prices,
    _non_positive_prices,
    _inverted_price_periods,
    _prices_of_another_business,
    _price_history_gaps,
    _negative_stock,
    _fractional_stock_in_whole_units,
    _invalid_movements,
    _broken_stock_chains,
    _stock_not_matching_last_movement,
    _products_without_variants,
    _duplicate_open_shortages,
    _non_positive_credits,
    _unvalidated_constraints,
)


def find_integrity_problems(db: Session) -> list[IntegrityProblem]:
    return [problem for check in CHECKS for problem in check(db)]
