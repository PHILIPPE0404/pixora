PIXORA — Galerie admin avec aperçus filigranés (Render)
=========================================================

FONCTIONNEMENT
- Tu ajoutes les images originales dans images/originals/ dans le dépôt GitHub.
- L'URL /admin est protégée par un mot de passe configuré dans Render.
- Dans l'administration, tu vois chaque image et peux copier son lien d'aperçu.
- Les liens /preview/nom-fichier renvoient une image convertie en WebP, réduite et marquée « PIXORA • APERÇU ».
- Le serveur ne publie jamais directement le dossier images/originals.

DÉPLOIEMENT
1. Décompresse ce ZIP et ajoute tous les fichiers au dépôt GitHub.
2. Sur Render, crée un Web Service (pas Static Site) et connecte le dépôt.
3. Runtime : Node.
4. Build Command : npm install
5. Start Command : npm start
6. Dans Environment, ajoute :
   ADMIN_PASSWORD = un mot de passe long, unique et difficile à deviner
   SESSION_SECRET = une longue valeur aléatoire d'au moins 32 caractères
   NODE_ENV = production
7. Déploie. Ton administration sera sur https://TON-SERVICE.onrender.com/admin
8. Pour ajouter des PDP, mets les originaux dans images/originals/ sur GitHub et pousse les changements. Render redéploiera l'application.

EXEMPLE
images/originals/pdp-neon.png
L'administration affichera un lien protégé de type :
https://TON-SERVICE.onrender.com/preview/pdp-neon.png

SÉCURITÉ IMPORTANTE
- Ne mets jamais ADMIN_PASSWORD ou SESSION_SECRET dans le dépôt.
- Change le mot de passe si tu le partages.
- Le dossier images/originals n'est pas servi comme un dossier statique : ne crée pas de route qui le rend public.
- Les URLs d'aperçu sont partageables. Elles contiennent une version filigranée et réduite, mais toute image visible dans un navigateur peut être capturée, photographiée ou copiée visuellement.
- N'utilise pas d'image dont tu n'as pas les droits.
- Le stockage de session par défaut d'Express convient pour un prototype simple, pas pour un service à grande échelle. Pour un usage plus important, configure un vrai magasin de sessions.

FORMAT
Formats acceptés : PNG, JPG/JPEG, WEBP, AVIF. Les fichiers SVG/GIF ne sont pas pris en charge.
