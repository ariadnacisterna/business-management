import unicodedata


def normalize_for_comparison(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.strip())
    without_accents = "".join(char for char in decomposed if not unicodedata.combining(char))
    return without_accents.lower()
