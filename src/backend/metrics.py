import math

EARTH_TEMP = 288.0  # K
# Schulze-Makuch et al. (2011) ESI weights
WEIGHTS = {"radius": 0.57, "density": 1.07, "escape_velocity": 0.70, "temperature": 5.58}


def _sim(x, x0):
    """Similarity of x to Earth's value x0, from 0 to 1."""
    return 1 - abs(x - x0) / (x + x0)


def planet_type(radius):
    if radius is None:
        return "Unknown"
    if radius < 1.25:
        return "Earth-sized"
    if radius < 2.0:
        return "Super-Earth"
    if radius < 6.0:
        return "Neptune-like"
    return "Gas giant"


def stellar_flux(p):
    """Starlight received, in Earth units (Earth = 1)."""
    if p.get("pl_insol") is not None:
        return p["pl_insol"]
    r, t, a = p.get("st_rad"), p.get("st_teff"), p.get("pl_orbsmax")
    if None in (r, t, a) or a == 0:
        return None
    luminosity = r**2 * (t / 5772) ** 4  # in Suns
    return luminosity / a**2


def habitable_zone(flux):
    if flux is None:
        return "Unknown"
    if flux > 1.1:
        return "Too hot"
    if flux < 0.36:
        return "Too cold"
    return "In habitable zone"


def esi(p):
    """Earth Similarity Index, 0 to 1. Returns (score, factors_used)."""
    r, m, t = p.get("pl_rade"), p.get("pl_bmasse"), p.get("pl_eqt")
    parts = {}
    if r:
        parts["radius"] = _sim(r, 1)
    if r and m:
        parts["density"] = _sim(m / r**3, 1)
        parts["escape_velocity"] = _sim(math.sqrt(m / r), 1)
    if t:
        parts["temperature"] = _sim(t, EARTH_TEMP)
    if "radius" not in parts or "temperature" not in parts:
        return None, 0
    n = len(parts)
    score = 1.0
    for k, v in parts.items():
        score *= v ** (WEIGHTS[k] / n)
    return score, n


def enrich(p):
    flux = stellar_flux(p)
    score, n = esi(p)
    p["type"] = planet_type(p.get("pl_rade"))
    p["flux"] = flux
    p["hz_status"] = habitable_zone(flux)
    p["esi"] = round(score, 3) if score is not None else None
    p["esi_factors"] = n  # 4 = full, 2 = partial (mass missing)
    return p