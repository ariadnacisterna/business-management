from app.constants.roles import ADMINISTRADOR, DUENO, EMPLEADO, GERENTE, ROLE_RANK


def test_role_rank_orders_roles_from_lowest_to_highest():
    assert ROLE_RANK[EMPLEADO] < ROLE_RANK[GERENTE]
    assert ROLE_RANK[GERENTE] < ROLE_RANK[ADMINISTRADOR]
    assert ROLE_RANK[ADMINISTRADOR] < ROLE_RANK[DUENO]
