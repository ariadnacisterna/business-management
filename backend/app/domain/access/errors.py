class AccessError(Exception):
    pass


class InvalidCredentials(AccessError):
    pass


class InactiveAccount(AccessError):
    pass


class AccountNotFound(AccessError):
    pass


class DuplicateUsername(AccessError):
    pass


class InvalidUsername(AccessError):
    pass


class InvalidPassword(AccessError):
    pass


class InvalidRole(AccessError):
    pass
