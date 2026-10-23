from dataclasses import dataclass

from app.constants.roles import ADMINISTRADOR, DUENO, EMPLEADO, GERENTE

PUBLIC = "publico"
ANY_SESSION = "cualquier sesion"


@dataclass(frozen=True)
class EndpointAccess:
    minimum_role: str
    source: str


ENDPOINT_ACCESS_MATRIX: dict[tuple[str, str], EndpointAccess] = {
    ("GET", "/health"): EndpointAccess(PUBLIC, "docs/09: chequeo de salud"),
    ("POST", "/auth/login"): EndpointAccess(PUBLIC, "docs/02: iniciar sesion"),
    ("POST", "/auth/logout"): EndpointAccess(ANY_SESSION, "docs/02: cerrar sesion"),
    ("GET", "/auth/me"): EndpointAccess(ANY_SESSION, "docs/02: ver Configuracion (D-063)"),
    ("PATCH", "/auth/me"): EndpointAccess(ANY_SESSION, "docs/02: cambiar el propio nombre (D-064)"),
    ("POST", "/auth/me/password"): EndpointAccess(
        ANY_SESSION, "docs/02: cambiar la propia contrasena (D-064)"
    ),
    ("PATCH", "/auth/me/preferences"): EndpointAccess(
        ANY_SESSION, "docs/02: elegir el propio tamano de letra (D-063)"
    ),
    ("POST", "/auth/active-business"): EndpointAccess(
        DUENO, "docs/02: elegir con que negocio trabajar (D-045)"
    ),
    ("POST", "/accounts"): EndpointAccess(ADMINISTRADOR, "docs/02: administrar cuentas y roles"),
    ("GET", "/accounts"): EndpointAccess(ADMINISTRADOR, "docs/02: administrar cuentas y roles"),
    ("GET", "/accounts/login-alerts"): EndpointAccess(
        ADMINISTRADOR, "T-081: aviso de accesos sospechosos en el Panel"
    ),
    ("GET", "/accounts/{account_id}"): EndpointAccess(
        ADMINISTRADOR, "docs/02: administrar cuentas y roles"
    ),
    ("PATCH", "/accounts/{account_id}"): EndpointAccess(
        ADMINISTRADOR, "docs/02: administrar cuentas y roles"
    ),
    ("POST", "/accounts/{account_id}/deactivate"): EndpointAccess(
        ADMINISTRADOR, "docs/02: administrar cuentas y roles"
    ),
    ("POST", "/accounts/{account_id}/activate"): EndpointAccess(
        ADMINISTRADOR, "docs/02: administrar cuentas y roles"
    ),
    ("POST", "/accounts/{account_id}/reset-password"): EndpointAccess(
        ADMINISTRADOR, "docs/02: administrar cuentas y roles (D-028)"
    ),
    ("POST", "/categories"): EndpointAccess(GERENTE, "docs/02: administrar categorias"),
    ("GET", "/categories"): EndpointAccess(EMPLEADO, "docs/02: navegar por categorias"),
    ("GET", "/categories/{category_id}"): EndpointAccess(
        EMPLEADO, "docs/02: navegar por categorias"
    ),
    ("PATCH", "/categories/{category_id}"): EndpointAccess(
        GERENTE, "docs/02: administrar categorias"
    ),
    ("POST", "/units"): EndpointAccess(GERENTE, "docs/02: administrar unidades"),
    ("GET", "/units"): EndpointAccess(EMPLEADO, "docs/02: buscar y consultar precios"),
    ("GET", "/units/{unit_id}"): EndpointAccess(EMPLEADO, "docs/02: buscar y consultar precios"),
    ("PATCH", "/units/{unit_id}"): EndpointAccess(GERENTE, "docs/02: administrar unidades"),
    ("POST", "/attributes"): EndpointAccess(GERENTE, "docs/02: administrar atributos"),
    ("GET", "/attributes"): EndpointAccess(EMPLEADO, "docs/02: buscar y consultar precios"),
    ("GET", "/attributes/{attribute_id}"): EndpointAccess(
        EMPLEADO, "docs/02: buscar y consultar precios"
    ),
    ("POST", "/attributes/{attribute_id}/values"): EndpointAccess(
        GERENTE, "docs/02: administrar valores de atributos"
    ),
    ("GET", "/attributes/{attribute_id}/values"): EndpointAccess(
        EMPLEADO, "docs/02: buscar y consultar precios"
    ),
    ("PATCH", "/attribute-values/{attribute_value_id}"): EndpointAccess(
        GERENTE, "docs/02: administrar valores de atributos"
    ),
    ("POST", "/attribute-values/{attribute_value_id}/deactivate"): EndpointAccess(
        GERENTE, "docs/02: administrar valores de atributos"
    ),
    ("POST", "/attribute-values/{attribute_value_id}/reactivate"): EndpointAccess(
        GERENTE, "docs/02: administrar valores de atributos"
    ),
    ("POST", "/products"): EndpointAccess(GERENTE, "docs/02: crear productos y variantes"),
    ("GET", "/products"): EndpointAccess(EMPLEADO, "docs/02: buscar y consultar precios"),
    ("GET", "/products/{product_id}"): EndpointAccess(
        EMPLEADO, "docs/02: buscar y consultar precios"
    ),
    ("PATCH", "/products/{product_id}"): EndpointAccess(
        GERENTE, "docs/02: modificar productos y variantes"
    ),
    ("POST", "/products/{product_id}/deactivate"): EndpointAccess(
        GERENTE, "docs/02: desactivar productos y variantes"
    ),
    ("POST", "/products/{product_id}/reactivate"): EndpointAccess(
        GERENTE, "docs/02: reactivar productos y variantes"
    ),
    ("POST", "/products/{product_id}/variants"): EndpointAccess(
        GERENTE, "docs/02: crear productos y variantes"
    ),
    ("POST", "/products/{product_id}/image"): EndpointAccess(
        GERENTE, "docs/02: modificar productos (D-049)"
    ),
    ("DELETE", "/products/{product_id}/image"): EndpointAccess(
        GERENTE, "docs/02: modificar productos (D-049)"
    ),
    ("PUT", "/products/{product_id}/provider"): EndpointAccess(
        ADMINISTRADOR, "D-074: asignar el proveedor habitual de un producto"
    ),
    ("PUT", "/products/{product_id}/price"): EndpointAccess(GERENTE, "docs/02: cambiar precios"),
    ("PATCH", "/variants/{variant_id}"): EndpointAccess(
        GERENTE, "docs/02: modificar productos y variantes"
    ),
    ("POST", "/variants/{variant_id}/deactivate"): EndpointAccess(
        GERENTE, "docs/02: desactivar productos y variantes"
    ),
    ("POST", "/variants/{variant_id}/reactivate"): EndpointAccess(
        GERENTE, "docs/02: reactivar productos y variantes"
    ),
    ("GET", "/variants/{variant_id}/price"): EndpointAccess(
        EMPLEADO, "docs/02: buscar y consultar precios"
    ),
    ("GET", "/variants/{variant_id}/prices"): EndpointAccess(
        EMPLEADO, "docs/02: consultar historial de precios"
    ),
    ("PUT", "/variants/{variant_id}/price"): EndpointAccess(GERENTE, "docs/02: cambiar precios"),
    ("GET", "/variants/{variant_id}/stock"): EndpointAccess(
        GERENTE, "D-062: ver el stock minimo queda para Gerente y superiores"
    ),
    ("PATCH", "/variants/{variant_id}/stock/minimum"): EndpointAccess(
        GERENTE, "D-062: cambiar el stock minimo"
    ),
    ("POST", "/variants/{variant_id}/stock/adjustments"): EndpointAccess(
        GERENTE, "docs/02 y D-062: ajustar el stock"
    ),
    ("GET", "/variants/{variant_id}/stock/movements"): EndpointAccess(
        GERENTE, "docs/02 y D-062: ver el historial de movimientos de stock"
    ),
    ("GET", "/stock"): EndpointAccess(EMPLEADO, "docs/02 y D-062: ver cantidad y estado"),
    ("GET", "/stock/counts"): EndpointAccess(EMPLEADO, "D-057: conteos agregados"),
    ("GET", "/stock/low-count"): EndpointAccess(EMPLEADO, "D-057: conteos agregados"),
    ("POST", "/providers"): EndpointAccess(ADMINISTRADOR, "D-055: administrar proveedores"),
    ("GET", "/providers"): EndpointAccess(ADMINISTRADOR, "D-055: ver proveedores"),
    ("GET", "/providers/{provider_id}"): EndpointAccess(ADMINISTRADOR, "D-055: ver proveedores"),
    ("PATCH", "/providers/{provider_id}"): EndpointAccess(
        ADMINISTRADOR, "D-055: administrar proveedores"
    ),
    ("PUT", "/providers/{provider_id}/categories"): EndpointAccess(
        ADMINISTRADOR, "D-055: administrar proveedores"
    ),
    ("POST", "/providers/{provider_id}/deactivate"): EndpointAccess(
        ADMINISTRADOR, "D-055: administrar proveedores"
    ),
    ("POST", "/providers/{provider_id}/reactivate"): EndpointAccess(
        ADMINISTRADOR, "D-055: administrar proveedores"
    ),
    ("POST", "/shortages"): EndpointAccess(EMPLEADO, "docs/02: marcar una variante como faltante"),
    ("GET", "/shortages"): EndpointAccess(EMPLEADO, "docs/02: consultar faltantes pendientes"),
    ("GET", "/shortages/count"): EndpointAccess(
        EMPLEADO, "docs/02: consultar faltantes pendientes"
    ),
    ("PATCH", "/shortages/{shortage_id}"): EndpointAccess(
        EMPLEADO, "docs/02: avanzar o cancelar el estado de un faltante"
    ),
    ("POST", "/customers"): EndpointAccess(GERENTE, "D-051 revisada: crear clientes"),
    ("GET", "/customers"): EndpointAccess(EMPLEADO, "docs/02: consultar el saldo de los clientes"),
    ("GET", "/customers/pending-balance"): EndpointAccess(
        EMPLEADO, "docs/02: consultar el saldo de los clientes"
    ),
    ("GET", "/customers/balances"): EndpointAccess(
        EMPLEADO, "docs/02 y D-061: saldo sin ultimo cambio para Empleado"
    ),
    ("GET", "/customers/{customer_id}"): EndpointAccess(
        EMPLEADO, "docs/02: consultar el saldo de los clientes"
    ),
    ("PATCH", "/customers/{customer_id}"): EndpointAccess(
        GERENTE, "D-051 revisada: modificar clientes"
    ),
    ("POST", "/customers/{customer_id}/deactivate"): EndpointAccess(
        GERENTE, "D-051 revisada: dar de baja clientes"
    ),
    ("POST", "/customers/{customer_id}/reactivate"): EndpointAccess(
        GERENTE, "D-051 revisada: reactivar clientes"
    ),
    ("GET", "/customers/{customer_id}/balance"): EndpointAccess(
        EMPLEADO, "docs/02: consultar el saldo de los clientes"
    ),
    ("GET", "/customers/{customer_id}/credits"): EndpointAccess(
        GERENTE, "docs/02 y D-061: historial de movimientos de un cliente"
    ),
    ("POST", "/customers/{customer_id}/credits"): EndpointAccess(
        EMPLEADO, "docs/02: registrar un cargo o un pago de un cliente"
    ),
    ("POST", "/sales"): EndpointAccess(EMPLEADO, "docs/02: registrar ventas"),
    ("GET", "/sales"): EndpointAccess(
        EMPLEADO, "docs/02: registrar ventas (T-085: todos ven ventas)"
    ),
    ("GET", "/sales/{sale_id}"): EndpointAccess(
        EMPLEADO, "docs/02: registrar ventas (T-085: todos ven ventas)"
    ),
    ("POST", "/sales/{sale_id}/void"): EndpointAccess(GERENTE, "D-078: anular una venta"),
    ("GET", "/search"): EndpointAccess(EMPLEADO, "docs/02: buscar y consultar precios"),
    ("POST", "/imports/preview"): EndpointAccess(
        ADMINISTRADOR, "docs/02: importar el catalogo inicial"
    ),
    ("POST", "/imports"): EndpointAccess(ADMINISTRADOR, "docs/02: importar el catalogo inicial"),
}
