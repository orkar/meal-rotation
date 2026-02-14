# Meal Rotation

Personal recipe pool + consistent in-app recipe view.

## Dev

Start:

```bash
cd /srv/docker/dev/meal-rotation
docker compose -p meal-rotation-dev -f docker-compose.dev.yml up -d
```

Links:
- Web (dev): `http://100.87.41.28:4305`
- API (dev): `http://100.87.41.28:3305/health`

## Scraping

The API tries to extract recipe data from the source page's JSON-LD (`application/ld+json`) where `@type` includes `Recipe`.
Some sites block scraping or don't publish structured data; those will show a scrape error.
