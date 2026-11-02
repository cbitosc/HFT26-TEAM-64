"""Vetted definitions Astro may use for "what is / what does X mean" questions.

Astro still never answers from the model's memory: for concept questions it is given
these definitions as its facts, exactly like it is given NASA's numbers for planets.
"""
import re

# (pattern, term, definition). Keep each definition short, plain and correct.
GLOSSARY = [
    (r"green ring|habitable zone|goldilocks|\bhz\b", "Habitable zone (the green ring)",
     "The band around a star where a rocky planet would receive the right amount of starlight for liquid water "
     "to possibly exist on its surface: not too hot, not too cold. SOLICE uses 0.36 to 1.1 times the starlight Earth "
     "receives from the Sun. The green ring in the system view is drawn from the star's own brightness, so it sits "
     "close in for dim red dwarfs and far out for bright stars. Being in the zone does not mean a planet has water or life."),
    (r"\besi\b|earth similarity", "Earth Similarity Index (ESI)",
     "A score from 0 to 1 for how similar a planet is to Earth in radius, density, escape velocity and temperature "
     "(Schulze-Makuch et al., 2011). 1.0 means identical to Earth; above about 0.8 is called Earth-like. When a planet's "
     "mass is not measured, a simpler 2-factor version (radius and temperature) is used. ESI measures similarity, "
     "not the chance of life."),
    (r"m[- ]?type|m[- ]?dwarf|red dwarf", "M-type star (red dwarf)",
     "The smallest, coolest and most common kind of star, with surface temperatures of about 2,400 to 3,700 K. "
     "They look red-orange, are much dimmer than the Sun and live for trillions of years. Because they are dim, their "
     "habitable zone is very close to the star, so planets there have years lasting only days or weeks."),
    (r"k[- ]?type|orange dwarf", "K-type star (orange dwarf)",
     "A star a bit smaller and cooler than the Sun, about 3,700 to 5,200 K, orange in colour and long-lived."),
    (r"g[- ]?type|yellow dwarf|sun[- ]?like star", "G-type star (yellow dwarf)",
     "A star like our Sun, about 5,200 to 6,000 K. The Sun's surface is about 5,772 K."),
    (r"f[- ]?type", "F-type star",
     "A star somewhat hotter and brighter than the Sun, about 6,000 to 7,500 K, yellow-white in colour."),
    (r"a[- ]?type star|b[- ]?type|o[- ]?type", "A, B and O-type stars",
     "Hot, bright, blue-white stars: A-type about 7,500 to 10,000 K, B-type 10,000 to 30,000 K, O-type above 30,000 K. "
     "They burn out much faster than the Sun."),
    (r"spectral (type|class)|star type|types? of stars?|oba?fgkm|star class", "Star types (spectral classes)",
     "Astronomers sort stars by surface temperature into classes O, B, A, F, G, K and M, from hottest to coolest. "
     "The Sun is a G-type star. M-type red dwarfs are the coolest and most common."),
    (r"light[- ]?years?|\bly\b", "Light-year",
     "The distance light travels in one year, about 9.46 trillion km. It measures distance, not time. "
     "The nearest star to the Sun, Proxima Centauri, is about 4.2 light-years away."),
    (r"\bparsecs?\b", "Parsec",
     "An astronomy distance unit equal to about 3.26 light-years. NASA lists distances in parsecs; SOLICE converts them to light-years."),
    (r"\bau\b|astronomical unit", "Astronomical unit (AU)",
     "The average distance from Earth to the Sun, about 150 million km. Orbit sizes are given in AU."),
    (r"equilibrium temp|\bteq\b", "Equilibrium temperature",
     "The temperature a planet would have from starlight alone if it had no atmosphere. Real surface temperature can "
     "be very different: Earth's equilibrium temperature is about 255 K, but its real average is about 288 K because "
     "of its atmosphere."),
    (r"kelvin", "Kelvin (K)",
     "The temperature scale scientists use. 0 K is absolute zero; water freezes at 273 K and boils at 373 K. "
     "To get degrees Celsius, subtract 273."),
    (r"orbital period|\byear length|\bperiod\b", "Orbital period",
     "The time a planet takes to go once around its star, its year. Earth's is 365.25 days."),
    (r"starlight|insolation|\bflux\b|instellation", "Starlight received (insolation)",
     "How much energy from its star a planet receives, compared with what Earth gets from the Sun. 1.0 means the same "
     "as Earth. This is what decides whether a planet is in the habitable zone."),
    (r"earth radi(us|i)|earth radius|x earth|earth mass", "Earth radius and Earth mass",
     "Units that compare a planet with Earth. A radius of 2 means twice Earth's width; a mass of 5 means five times "
     "Earth's mass."),
    (r"luminosity|how bright", "Luminosity",
     "The total energy a star gives out, compared with the Sun. SOLICE works it out from the star's radius and "
     "temperature when NASA doesn't list it."),
    (r"super[- ]?earth", "Super-Earth",
     "A planet larger than Earth but smaller than Neptune, roughly 1.25 to 2 Earth radii. It may be rocky. "
     "There are none in our Solar System."),
    (r"(mini|sub)[- ]?neptune|neptune[- ]?like|neptune[- ]?sized", "Sub-Neptune / Neptune-sized",
     "Planets from about 2 to 6 Earth radii, likely with thick gas envelopes rather than a rocky surface you could stand on."),
    (r"gas giant|jupiter[- ]?(like|sized)|hot jupiter", "Gas giant / hot Jupiter",
     "A huge planet made mostly of hydrogen and helium, like Jupiter. A hot Jupiter is a gas giant orbiting very close "
     "to its star, with a year of only a few days."),
    (r"rocky (world|planet)|terrestrial", "Rocky planet",
     "A planet with a solid surface of rock and metal, like Earth or Mars. Planets under about 1.6 Earth radii are "
     "likely to be rocky."),
    (r"exoplanets?", "Exoplanet",
     "A planet that orbits a star other than our Sun. More than 6,000 are confirmed."),
    (r"transit", "Transit method",
     "Finding a planet by the tiny dip in a star's brightness when the planet passes in front of it. It also gives the "
     "planet's size. Most known exoplanets were found this way."),
    (r"radial velocity|wobble|doppler", "Radial velocity method",
     "Finding a planet by the small wobble it causes in its star, seen as shifts in the star's light. It gives the "
     "planet's mass."),
    (r"escape velocity", "Escape velocity",
     "How fast something must go to leave a planet's gravity. Earth's is about 11.2 km/s. It is one of the four ESI factors."),
    (r"\bdensity\b", "Density",
     "Mass divided by volume. Rocky planets are dense (Earth about 5.5 g/cm3); gas giants are not."),
    (r"log(arithmic)? scale", "Log scale (in SOLICE)",
     "Space is too big to show to scale, so SOLICE compresses distances and orbit sizes with a log scale. The order and "
     "the real ratios between orbit periods are kept; exact values are always shown in the panel."),
    (r"nasa exoplanet archive|pscomppars|where.*data", "NASA Exoplanet Archive",
     "NASA's official catalogue of confirmed exoplanets, run by Caltech. SOLICE reads its pscomppars table, which has "
     "one best-value row per planet, through NASA's TAP API."),
]

_COMPILED = [(re.compile(p, re.I), t, d) for p, t, d in GLOSSARY]

DEFINE_Q = re.compile(
    r"\b(what('s| is| are| does| do)|whats|define|definition|meaning|means?|explain|stand for|what kind)\b", re.I
)


def glossary_hits(message, limit=3):
    """Glossary entries whose term appears in the message."""
    hits = []
    for rx, term, definition in _COMPILED:
        if rx.search(message):
            hits.append((term, definition))
        if len(hits) >= limit:
            break
    return hits


def definitions_block(hits):
    return "## DEFINITIONS (SOLICE glossary)\n" + "\n".join(f"- {t}: {d}" for t, d in hits)
