LY_PER_PC = 3.2616


def fmt(x, nd=2):
    s = f"{x:.{nd}f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s


def star_class(teff):
    if teff is None:
        return None
    if teff < 3700:
        return "cool red dwarf"
    if teff < 5200:
        return "orange dwarf"
    if teff < 6000:
        return "Sun-like star"
    if teff < 7500:
        return "hot yellow-white star"
    return "hot blue-white star"


def esi_label(esi):
    if esi is None:
        return "unknown"
    if esi >= 0.8:
        return "high"
    if esi >= 0.6:
        return "moderate"
    return "low"


def build_facts(p):
    """Plain-language facts computed in code. The LLM only phrases these."""
    lines, chips = [], []
    ptype = p.get("type") or "Unknown"
    r, m = p.get("pl_rade"), p.get("pl_bmasse")
    per, a = p.get("pl_orbper"), p.get("pl_orbsmax")
    eq, flux = p.get("pl_eqt"), p.get("flux")
    esi, n = p.get("esi"), p.get("esi_factors")
    hz = p.get("hz_status")
    host = p.get("hostname") or "its star"
    teff, srad = p.get("st_teff"), p.get("st_rad")

    chips.append(ptype)

    if r is not None:
        lines.append(f"Size: radius is {fmt(r)} times Earth's. Planet class: {ptype}.")
        chips.append(f"{fmt(r)}× Earth's radius")
    else:
        lines.append(f"Planet class: {ptype}. Radius is not in the data.")

    if m is not None:
        lines.append(f"Mass: {fmt(m)} times Earth's.")
    else:
        lines.append("Mass: not measured, so it is unknown.")

    if per is not None:
        year = f"{fmt(per * 24, 1)} hours" if per < 1 else f"{fmt(per, 1)} days"
        lines.append(f"Orbit: one year on this planet lasts {year} (Earth's lasts 365 days).")
    if a is not None:
        lines.append(f"Orbit distance: {fmt(a, 3)} AU from its star (Earth is 1 AU from the Sun).")

    if flux is not None:
        pct = flux * 100
        pct_txt = f"{pct:,.0f}" if pct >= 10 else fmt(pct, 1)
        lines.append(f"Starlight: receives about {pct_txt}% of the energy Earth gets from the Sun.")
        chips.append(f"{pct_txt}% of Earth's starlight")
    else:
        lines.append("Starlight: cannot be determined from the data.")

    if eq is not None:
        lines.append(
            f"Temperature: equilibrium temperature is {round(eq)} K ({round(eq - 273.15)} °C). "
            "This is not a surface temperature. Earth's own equilibrium temperature is about 255 K (-18 °C)."
        )
        chips.append(f"{round(eq)} K")
    else:
        lines.append("Temperature: not available in the data.")

    if esi is not None:
        label = esi_label(esi)
        lines.append(
            f"Earth Similarity Index (ESI): {esi:.2f}, which is {label} "
            f"(1.0 would be identical to Earth). It used {n} of 4 factors: radius, density, escape velocity, temperature."
        )
        chips.append(f"ESI {esi:.2f} · {label}")
    else:
        lines.append("ESI: cannot be computed because key data is missing.")

    if hz == "In habitable zone":
        lines.append("Habitable zone: its orbit is inside the habitable zone, the band of distances where starlight is similar to what lets Earth have liquid water.")
    elif hz == "Too hot":
        lines.append("Habitable zone: it receives more starlight than the habitable zone allows, so it is too hot.")
    elif hz == "Too cold":
        lines.append("Habitable zone: it receives less starlight than the habitable zone needs, so it is too cold.")
    else:
        lines.append("Habitable zone: cannot be determined from NASA's data.")
    if hz and hz != "Unknown":
        chips.append(hz)

    cls = star_class(teff)
    if cls:
        extra = f", {fmt(srad)} times the Sun's radius" if srad is not None else ""
        lines.append(f"Host star: {host} is a {cls} (about {round(teff)} K{extra}).")
    else:
        lines.append(f"Host star: {host}. Its type is not in the data.")

    if p.get("sy_pnum"):
        k = p["sy_pnum"]
        lines.append(f"The star has {k} known planet{'s' if k != 1 else ''}.")

    if p.get("sy_dist") is not None:
        ly = p["sy_dist"] * LY_PER_PC
        lines.append(f"Distance from Earth: about {round(ly) if ly >= 100 else fmt(ly, 1)} light-years.")

    if p.get("disc_year"):
        lines.append(f"Discovered in {p['disc_year']} using the {p.get('discoverymethod')} method.")

    return {"name": p["pl_name"], "chips": chips, "lines": lines}