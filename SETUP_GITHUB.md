# GitHub setup

## Recommended: separate repository

Create a new repository such as `NavBand-Roundabout-Simulator` so the lab does
not interfere with the NavBand Android repository.

### Web upload

1. GitHub → New repository.
2. Use a public repository if you are on GitHub Free and want GitHub Pages.
3. Upload the **contents** of this package so `index.html` is at repository root.
4. Commit to `main`.
5. Settings → Pages → Build and deployment → GitHub Actions.
6. The included `.github/workflows/pages.yml` runs tests and deploys the site.
7. Open the Pages URL shown by GitHub.

For GitHub.com the project URL is normally:
`https://YOUR-USER.github.io/NavBand-Roundabout-Simulator/`

### Codespaces

If using your existing Codespaces workflow:

```bash
git clone https://github.com/YOUR-USER/NavBand-Roundabout-Simulator.git
cd NavBand-Roundabout-Simulator
# copy these project files into the repository
git add .
git commit -m "Initial roundabout simulator"
git push origin main
```

### First run

1. Open the Pages site.
2. Keep mode on **Replay**.
3. Load each bundled scenario.
4. Press **ANALIZZA SCENARIO**.
5. Verify exit, score and explanations.
6. Only then switch to **Live**.

### Live Valhalla

Default endpoint: `https://valhalla1.openstreetmap.de`

The endpoint is configurable in the GUI. The official Valhalla public demo
server asks public clients to identify themselves via `X-Client-Id` and is
subject to fair-use/rate limits. For heavy testing, use a dedicated Valhalla
instance later.

### Important

The bundled scenarios are synthetic. Their coordinates and expected exits are
not real-world validation data.
