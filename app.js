const express = require("express");
const session = require("express-session");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error("Set ADMIN_PASSWORD and SESSION_SECRET in Render Environment.");
  process.exit(1);
}

const originalsDir = path.join(__dirname, "images", "originals");
const allowedExt = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);

app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(session({
  name: "pixora_admin",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 4
  }
}));

function isLoggedIn(req, res, next) {
  if (req.session && req.session.admin === true) return next();
  return res.redirect("/admin");
}
function getImages() {
  if (!fs.existsSync(originalsDir)) fs.mkdirSync(originalsDir, { recursive: true });
  return fs.readdirSync(originalsDir, { withFileTypes: true })
    .filter(x => x.isFile() && allowedExt.has(path.extname(x.name).toLowerCase()))
    .map(x => x.name)
    .sort((a,b) => a.localeCompare(b, "fr"));
}
function safeImagePath(filename) {
  if (!filename || path.basename(filename) !== filename) return null;
  if (!allowedExt.has(path.extname(filename).toLowerCase())) return null;
  const full = path.join(originalsDir, filename);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);
}
function page(title, body) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${esc(title)}</title><link rel="stylesheet" href="/style.css"></head><body>
  <header><a class="brand" href="/">PIXORA</a><span>Galerie d'aperçus</span></header>
  <main>${body}</main><footer>Pixora · Les fichiers originaux ne sont jamais servis directement.</footer></body></html>`;
}

app.use(express.static(path.join(__dirname, "public"), {
  index: false,
  dotfiles: "deny",
  setHeaders(res) { res.setHeader("X-Content-Type-Options", "nosniff"); }
}));

app.get("/", (req, res) => {
  res.send(page("Pixora — Aperçus", `
    <section class="hero"><p class="eyebrow">PDP PERSONNALISÉES</p>
    <h1>Ton avatar, <span>ton univers.</span></h1>
    <p>Les aperçus publics sont filigranés et réduits. Le fichier original reste privé.</p>
    <a class="button" href="/admin">Ouvrir l'administration</a></section>
    <p class="notice">Cette galerie limite la réutilisation, mais aucune page web ne peut empêcher complètement les captures d'écran.</p>`));
});

app.get("/admin", (req, res) => {
  if (req.session && req.session.admin === true) return res.redirect("/admin/gallery");
  res.send(page("Administration Pixora", `
    <section class="login card"><p class="eyebrow">ESPACE PRIVÉ</p><h1>Administration</h1>
    <p>Entre le mot de passe configuré dans les variables d'environnement de Render.</p>
    <form method="post" action="/admin/login">
      <label for="password">Mot de passe administrateur</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button class="button" type="submit">Connexion</button>
    </form>
    <p class="small">Ne partage pas ce mot de passe et ne le mets jamais dans le dépôt GitHub.</p></section>`));
});

app.post("/admin/login", (req, res) => {
  const submitted = String(req.body.password || "");
  if (submitted.length > 500 || submitted !== ADMIN_PASSWORD) {
    return res.status(401).send(page("Connexion refusée", `<section class="card"><h1>Mot de passe incorrect</h1><a class="button" href="/admin">Réessayer</a></section>`));
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).send("Erreur de session. Réessaie.");
    req.session.admin = true;
    res.redirect("/admin/gallery");
  });
});

app.get("/admin/gallery", isLoggedIn, (req, res) => {
  const files = getImages();
  const cards = files.map(name => {
    const url = `/preview/${encodeURIComponent(name)}`;
    return `<article class="image-card">
      <a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Aperçu protégé de ${esc(name)}"></a>
      <div class="image-info"><strong>${esc(name)}</strong>
      <code class="url">${esc(url)}</code>
      <button class="button small-button" type="button" data-copy="${esc(url)}">Copier le lien protégé</button></div>
    </article>`;
  }).join("");
  const content = `<section class="admin-heading"><div><p class="eyebrow">ESPACE PRIVÉ</p><h1>Images du dépôt</h1>
    <p>Ajoute tes fichiers dans <code>images/originals/</code> sur GitHub puis redéploie Render. Les liens copiés renvoient uniquement une image filigranée.</p></div>
    <form method="post" action="/admin/logout"><button class="button secondary" type="submit">Déconnexion</button></form></section>
    <div class="notice"><strong>${files.length} image(s) détectée(s)</strong> · Les originaux ne sont pas accessibles par URL.</div>
    ${files.length ? `<div class="gallery">${cards}</div>` : `<div class="empty"><h2>Aucune image pour l'instant</h2><p>Ajoute des fichiers PNG, JPG, WEBP ou AVIF dans <code>images/originals/</code>, pousse sur GitHub puis attends le redéploiement.</p></div>`}
    <script>
      document.querySelectorAll("[data-copy]").forEach(button => button.addEventListener("click", async () => {
        const full = location.origin + button.dataset.copy;
        try { await navigator.clipboard.writeText(full); button.textContent = "Lien copié !"; }
        catch { window.prompt("Copie ce lien :", full); }
      }));
    </script>`;
  res.send(page("Galerie admin Pixora", content));
});

app.post("/admin/logout", isLoggedIn, (req, res) => {
  req.session.destroy(() => res.redirect("/admin"));
});

// Protected preview endpoint: originals are read server-side, resized and watermarked.
app.get("/preview/:filename", async (req, res) => {
  const filename = req.params.filename;
  const full = safeImagePath(filename);
  if (!full) return res.status(404).send("Image introuvable");
  try {
    const watermarkSvg = Buffer.from(`<svg width="900" height="600" xmlns="http://www.w3.org/2000/svg">
      <defs><pattern id="p" width="320" height="150" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
      <text x="0" y="82" font-family="Arial,sans-serif" font-size="35" font-weight="900" fill="#ffffff" fill-opacity="0.60">PIXORA • APERÇU</text>
      </pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`);
    const output = await sharp(full, { limitInputPixels: 40000000 })
      .rotate()
      .resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#10091b" })
      .composite([{ input: watermarkSvg, blend: "over" }])
      .webp({ quality: 62 })
      .toBuffer();
    res.set({
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline; filename=\"pixora-preview.webp\""
    });
    res.send(output);
  } catch (e) {
    console.error("Preview generation failed:", e.message);
    res.status(415).send("Impossible de générer l'aperçu pour ce fichier.");
  }
});

app.use((req, res) => res.status(404).send(page("Introuvable", `<section class="card"><h1>Page introuvable</h1><a class="button" href="/">Retour à l'accueil</a></section>`)));

app.listen(PORT, () => console.log(`Pixora gallery listening on ${PORT}`));
