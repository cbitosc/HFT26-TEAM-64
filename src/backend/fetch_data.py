import requests, json

QUERY = """
select pl_name, hostname, discoverymethod, disc_year, sy_dist,
       pl_rade, pl_bmasse, pl_orbper, pl_orbsmax, pl_eqt, pl_insol,
       st_teff, st_rad, st_mass, sy_pnum, ra, dec
from pscomppars
where pl_rade is not null and sy_dist is not null
"""

r = requests.get(
    "https://exoplanetarchive.ipac.caltech.edu/TAP/sync",
    params={"query": QUERY, "format": "json"},
    timeout=60,
)
r.raise_for_status()
data = r.json()
json.dump(data, open("exoplanets.json", "w"))
print(f"Saved {len(data)} planets")
