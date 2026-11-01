
const express = require("express");
const session = require("express-session");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error(
    "Erreur : ADMIN_PASSWORD et SESSION_SECRET doivent être configurés."
  );
  process.exit(1);
}

const ROOT = __dirname;
const ORIGINALS_DIR = path.join(ROOT, "images", "originals");
const PUBLIC_DIR = path.join(ROOT, "public");

fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_DIR, { recursive: true });

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.json({ limit: "20kb" }));

app.use(
  session({
    name: "pixora.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

// Fichiers publics du site : CSS, JavaScript, logos, etc.
app.use(express.static(PUBLIC_DIR, {
  index: false,
  dotfiles: "deny"
}));

const ALLOWED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif"
]);

function safeImagePath(filename) {
  if (
    typeof filename !== "string" ||
    filename.length === 0 ||
    filename.length > 200 ||
    filename !== path.basename(filename) ||
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\")
  ) {
    return null;
  }

  const extension = path.extname(filename).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return null;
  }

  const fullPath = path.resolve(ORIGINALS_DIR, filename);

  if (!fullPath.startsWith(path.resolve(ORIGINALS_DIR) + path.sep)) {
    return null;
  }

  try {
    if (!fs.statSync(fullPath).isFile()) {
      return null;
    }
  } catch {
    return null;
  }

  return fullPath;
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }

  return res.redirect("/admin");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function listImages() {
  try {
    return fs
      .readdirSync(ORIGINALS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) =>
        ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase())
      )
      .sort((a, b) => a.localeCompare(b, "fr"));
  } catch (error) {
    console.error("Impossible de lire la galerie :", error.message);
    return [];
  }
}

// Page de connexion administrateur
app.get("/admin", (req, res) => {
  if (req.session && req.session.isAdmin === true) {
    return res.redirect("/admin/gallery");
  }

  res.type("html").send(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connexion admin — Pixora</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      padding: 20px; background: #0b0d0b; color: #f5f5f5;
      font-family: Arial, sans-serif;
    }
    main {
      width: 100%; max-width: 390px; padding: 30px;
      background: #151815; border: 1px solid #303630;
      border-radius: 18px;
    }
    h1 { margin-top: 0; }
    p { color: #b9c0b9; line-height: 1.5; }
    input, button {
      width: 100%; padding: 13px; margin-top: 12px;
      border-radius: 10px; font-size: 16px;
    }
    input {
      background: #0b0d0b; border: 1px solid #414941;
      color: white;
    }
    button {
      border: 0; background: #c8ff3d; color: #101510;
      font-weight: bold; cursor: pointer;
    }
  </style>
</head>
<body>
  <main>
    <h1>PIXORA</h1>
    <p>Connexion à l'espace administrateur.</p>
    <form method="POST" action="/admin/login">
      <label for="password">Mot de passe administrateur</label>
      <input id="password" name="password" type="password"
        autocomplete="current-password" required>
      <button type="submit">Se connecter</button>
    </form>
  </main>
</body>
</html>`);
});

// Traitement de la connexion
app.post("/admin/login", (req, res, next) => {
  const password = req.body && req.body.password;

  if (
    typeof password !== "string" ||
    password.length > 1024 ||
    password !== ADMIN_PASSWORD
  ) {
    return res.status(401).type("html").send(`<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connexion refusée — Pixora</title></head>
<body style="font-family:Arial,sans-serif;background:#0b0d0b;color:white;padding:30px">
  <h1>Connexion refusée</h1>
  <p>Mot de passe incorrect.</p>
  <a href="/admin" style="color:#c8ff3d">Réessayer</a>
</body>
</html>`);
  }

  req.session.regenerate((error) => {
    if (error) return next(error);

    req.session.isAdmin = true;

    req.session.save((saveError) => {
      if (saveError) return next(saveError);
      res.redirect("/admin/gallery");
    });
  });
});

// Galerie administrateur
app.get("/admin/gallery", requireAdmin, (req, res) => {
  const images = listImages();

  const cards = images.map((filename) => {
    const safeName = escapeHtml(filename);
    const encodedName = encodeURIComponent(filename);

    return `
      <article class="card">
        <a href="/preview/${encodedName}" target="_blank" rel="noopener">
          <img loading="lazy" src="/preview/${encodedName}"
            alt="Aperçu de ${safeName}">
        </a>
        <p>${safeName}</p>
        <a class="link" href="/preview/${encodedName}"
          target="_blank" rel="noopener">Ouvrir l'aperçu</a>
      </article>`;
  }).join("");

  res.type("html").send(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Galerie admin — Pixora</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 24px; background: #0b0d0b; color: #f5f5f5;
      font-family: Arial, sans-serif;
    }
    header {
      display: flex; justify-content: space-between; align-items: center;
      gap: 16px; flex-wrap: wrap; margin-bottom: 24px;
    }
    h1 { margin: 0; }
    .button, .link {
      display: inline-block; padding: 10px 14px; border-radius: 9px;
      background: #c8ff3d; color: #111; font-weight: bold;
      text-decoration: none;
    }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
      gap: 18px;
    }
    .card {
      padding: 12px; border: 1px solid #303630;
      border-radius: 14px; background: #151815; overflow: hidden;
    }
    .card img {
      display: block; width: 100%; aspect-ratio: 1;
      object-fit: contain; background: #101210; border-radius: 9px;
    }
    .card p { overflow-wrap: anywhere; color: #d5dbd5; }
    .empty { color: #c1c8c1; line-height: 1.6; }
  </style>
</head>
<body>
  <header>
    <h1>Galerie Pixora</h1>
    <form method="POST" action="/admin/logout">
      <button class="button" type="submit">Déconnexion</button>
    </form>
  </header>
  <p>${images.length} image(s) trouvée(s).</p>
  ${images.length
    ? `<section class="grid">${cards}</section>`
    : `<p class="empty">Aucune image trouvée dans images/originals. Ajoute tes fichiers dans ce dossier puis recharge cette page.</p>`}
</body>
</html>`);
});

// Déconnexion
app.post("/admin/logout", requireAdmin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie("pixora.sid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    });

    res.redirect("/admin");
  });
});

// Aperçu protégé avec filigrane
app.get("/preview/:filename", async (req, res) => {
  const filename = req.params.filename;
  const fullPath = safeImagePath(filename);

  if (!fullPath) {
    return res.status(404).send("Image introuvable.");
  }

  try {
    // Étape 1 : corriger l'orientation et redimensionner l'image.
    const resizedBuffer = await sharp(fullPath, {
      limitInputPixels: 40000000
    })
      .rotate()
      .resize({
        width: 720,
        height: 720,
        fit: "inside",
        withoutEnlargement: true
      })
      .flatten({ background: "#10091b" })
      .webp({ quality: 82 })
      .toBuffer();

    // Étape 2 : récupérer les dimensions après redimensionnement.
    const metadata = await sharp(resizedBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (!width || !height) {
      throw new Error("Dimensions de l'image indisponibles.");
    }

    // Étape 3 : créer un filigrane aux dimensions exactes de l'image.
    const watermarkSvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg"
           width="${width}" height="${height}"
           viewBox="0 0 ${width} ${height}">
        <defs>
          <pattern id="watermark"
                   width="260" height="120"
                   patternUnits="userSpaceOnUse"
                   patternTransform="rotate(-28)">
            <text x="0" y="65"
                  font-family="Arial,sans-serif"
                  font-size="27"
                  font-weight="900"
                  fill="#ffffff"
                  fill-opacity="0.62">
              PIXORA • APERÇU
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#watermark)"/>
      </svg>
    `);

    // Étape 4 : appliquer le filigrane et générer le WebP final.
    const output = await sharp(resizedBuffer)
      .composite([
        {
          input: watermarkSvg,
          blend: "over"
        }
      ])
      .webp({ quality: 62 })
      .toBuffer();

    res.set({
      "Content-Type": "image/webp",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'inline; filename="pixora-preview.webp"'
    });

    return res.send(output);
  } catch (error) {
    console.error(
      "Erreur de génération de l'aperçu :",
      error.stack || error.message
    );

    return res
      .status(415)
      .type("text")
      .send("Impossible de générer l'aperçu pour ce fichier.");
  }
});

// Page d'accueil de secours
app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pixora</title>
  <style>
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      padding: 20px; background: #0b0d0b; color: white;
      font-family: Arial, sans-serif; text-align: center;
    }
    h1 { font-size: clamp(42px, 10vw, 76px); margin-bottom: 10px; }
    span { color: #c8ff3d; }
    p { color: #c4ccc4; line-height: 1.6; }
    a { color: #c8ff3d; }
  </style>
</head>
<body>
  <main>
    <h1>PIXORA<span>.</span></h1>
    <p>Des photos de profil personnalisées pour ton univers en ligne.</p>
    <p><a href="/admin">Espace administrateur</a></p>
  </main>
</body>
</html>`);
});

// Routes inconnues
app.use((req, res) => {
  res.status(404).type("text").send("Page introuvable.");
});

// Gestion générale des erreurs
app.use((error, req, res, next) => {
  console.error("Erreur serveur :", error.stack || error.message);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).type("text").send("Erreur interne du serveur.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Pixora démarré sur le port ${PORT}`);
});
