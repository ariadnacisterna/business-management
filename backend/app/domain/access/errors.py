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


class InvalidAccountName(AccessError):
    pass


class InvalidFontSize(AccessError):
    pass


class WrongCurrentPassword(AccessError):
    pass


class PasswordUnchanged(AccessError):
    pass


class InvalidPassword(AccessError):
    pass


class InvalidRole(AccessError):
    pass


class InsufficientRoleRank(AccessError):
    pass


class SelfActionForbidden(AccessError):
    pass


class NoBusinessAccess(AccessError):
    pass


class BusinessNotAccessible(AccessError):
    pass


class LoginLocked(AccessError):
    def __init__(self, retry_after_seconds: int):
        self.retry_after_seconds = retry_after_seconds
        super().__init__(retry_after_seconds)
