/**
 * Admin panel: sign in with NEWS_ADMIN_TOKEN, then create, edit and delete articles.
 * French or English from the FR / EN toggle (remembered per browser); before a
 * choice is made, French when the browser is in French, English otherwise.
 * Everything from the API is inserted as text, never as HTML.
 */
'use strict';

const STRINGS = {
  fr: {
    'page.title': 'Leptumon · Actualités',
    'nav.news': 'Actualités',
    'nav.logout': 'Se déconnecter',
    'login.title': 'Administration',
    'login.help': 'Entrez votre jeton pour gérer les actualités du launcher',
    'login.token': "Jeton d'administration",
    'login.remember': 'Rester connecté sur cet appareil',
    'login.submit': 'Se connecter',
    'login.error_title': 'Connexion refusée',
    'login.invalid': "Ce jeton n'est pas le bon.",
    'login.too_many': 'Trop de tentatives. Réessayez dans 15 minutes.',
    'login.footer': 'Le jeton est la valeur de NEWS_ADMIN_TOKEN sur le serveur.',
    'login.footer_hint': "Demandez-le à la personne qui gère le serveur si vous ne l'avez pas.",
    'list.title': 'Gestion des actualités',
    'list.subtitle': 'Créez et gérez les actualités affichées dans le launcher',
    'list.new': 'Créer un article',
    'list.feed': 'Adresse du flux pour le launcher :',
    'list.copy': 'Copier',
    'list.copied': 'Adresse copiée.',
    'list.copy_manual': 'Copie impossible ici : l\'adresse est sélectionnée, faites Ctrl+C.',
    'list.loading': 'Chargement des articles...',
    'list.empty_title': 'Aucun article',
    'list.empty_text': 'Créez votre premier article pour commencer',
    'list.error_title': 'Impossible de charger les articles',
    'list.retry': 'Réessayer',
    'list.edit': 'Modifier',
    'list.delete': 'Supprimer',
    'list.created': 'Créé le <date>',
    'list.modified': 'Modifié le <date>',
    'editor.new': 'Créer un article',
    'editor.edit': "Modifier l'article",
    'editor.create': "Publier l'article",
    'editor.update': 'Enregistrer',
    'editor.title': 'Titre',
    'editor.description': 'Texte',
    'editor.description_hint': 'Texte simple : les retours à la ligne sont conservés dans le launcher.',
    'editor.image': 'Image',
    'editor.upload': 'Importer',
    'editor.remove': 'Retirer',
    'editor.image_hint': 'Facultative. Format paysage conseillé (16:9). PNG, JPEG, WebP ou GIF, ou une adresse https.',
    'editor.uploading': "Envoi de l'image...",
    'editor.link': 'Lien',
    'editor.link_hint': 'Facultatif. Ajoute un bouton « Ouvrir le lien » sous l\'article dans le launcher. https uniquement.',
    'editor.required': 'Le titre et le texte sont obligatoires.',
    'editor.created': 'Article publié.',
    'editor.saved': 'Article mis à jour.',
    'delete.title': "Supprimer l'article",
    'delete.text': '« <title> » disparaîtra du launcher. Cette action est définitive.',
    'delete.confirm': 'Supprimer',
    'delete.done': 'Article supprimé.',
    'common.cancel': 'Annuler',
    'common.close': 'Fermer',
    'errors.session': 'Session expirée, reconnectez-vous.',
    'errors.generic': 'Erreur : <message>',
  },
  en: {
    'page.title': 'Leptumon · News',
    'nav.news': 'News',
    'nav.logout': 'Sign out',
    'login.title': 'Admin sign-in',
    'login.help': "Enter your token to manage the launcher's news",
    'login.token': 'Admin token',
    'login.remember': 'Stay signed in on this device',
    'login.submit': 'Sign in',
    'login.error_title': 'Sign-in refused',
    'login.invalid': "That token isn't right.",
    'login.too_many': 'Too many attempts. Try again in 15 minutes.',
    'login.footer': 'The token is the NEWS_ADMIN_TOKEN value on the server.',
    'login.footer_hint': "Ask whoever runs the server if you don't have it.",
    'list.title': 'News management',
    'list.subtitle': 'Create and manage the news shown in the launcher',
    'list.new': 'Create article',
    'list.feed': 'Feed address for the launcher:',
    'list.copy': 'Copy',
    'list.copied': 'Address copied.',
    'list.copy_manual': "Couldn't copy here: the address is selected, press Ctrl+C.",
    'list.loading': 'Loading articles...',
    'list.empty_title': 'No articles',
    'list.empty_text': 'Create your first article to get started',
    'list.error_title': "Couldn't load the articles",
    'list.retry': 'Try again',
    'list.edit': 'Edit',
    'list.delete': 'Delete',
    'list.created': 'Created <date>',
    'list.modified': 'Edited <date>',
    'editor.new': 'Create article',
    'editor.edit': 'Edit article',
    'editor.create': 'Publish article',
    'editor.update': 'Save changes',
    'editor.title': 'Title',
    'editor.description': 'Text',
    'editor.description_hint': 'Plain text: line breaks are kept in the launcher.',
    'editor.image': 'Image',
    'editor.upload': 'Upload',
    'editor.remove': 'Remove',
    'editor.image_hint': 'Optional. Landscape works best (16:9). PNG, JPEG, WebP or GIF, or an https address.',
    'editor.uploading': 'Uploading image...',
    'editor.link': 'Link',
    'editor.link_hint': 'Optional. Adds an "Open link" button under the article in the launcher. https only.',
    'editor.required': 'Title and text are required.',
    'editor.created': 'Article published.',
    'editor.saved': 'Article updated.',
    'delete.title': 'Delete article',
    'delete.text': '"<title>" will disappear from the launcher. This cannot be undone.',
    'delete.confirm': 'Delete',
    'delete.done': 'Article deleted.',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'errors.session': 'Session expired, please sign in again.',
    'errors.generic': 'Error: <message>',
  },
};

const LANG_KEY = 'leptumon-news-lang';

const initialLanguage = () => {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch {
    // Storage blocked: fall back to the browser language.
  }
  return (navigator.languages?.[0] ?? navigator.language ?? 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
};

let lang = initialLanguage();
let dateFormat;

const t = (key, params = {}) =>
  Object.entries(params).reduce((text, [name, value]) => text.replace(`<${name}>`, value), STRINGS[lang][key] ?? key);

const formatDate = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
};

const $ = (id) => document.getElementById(id);

/** Builds an element: el('p', { className: 'x' }, 'text', child). Strings become text nodes. */
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};

/** An icon from the sprite in index.html. */
const icon = (name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
};

// The panel lives at <base>/admin/, the API at <base>/v1/, so this works under any reverse-proxy path.
const API_BASE = new URL('../v1/', window.location.href);
const FEED_URL = new URL('public/news', API_BASE).href;
const TOKEN_KEY = 'leptumon-news-token';

// ---------------------------------------------------------------------------
// Token storage: this tab only, unless "stay signed in" was ticked.
// ---------------------------------------------------------------------------
const storage = {
  read() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  },
  write(token, remember) {
    try {
      (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    } catch {
      // Storage blocked: the token only lives in memory for this page.
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing stored.
    }
  },
};

let token = storage.read();
/** Last list from the API, kept so a language switch can redraw the cards. */
let articles = [];

class SessionExpiredError extends Error {}

const api = async (route, { method = 'GET', body, headers = {} } = {}) => {
  const response = await fetch(new URL(route, API_BASE), {
    method,
    body,
    headers: { authorization: `Bearer ${token}`, ...headers },
  });
  if (response.status === 401) {
    signOut(t('errors.session'));
    throw new SessionExpiredError();
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      message = (await response.json()).error || message;
    } catch {
      // Not JSON.
    }
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
};

// ---------------------------------------------------------------------------
// Toasts (top right) and inline errors
// ---------------------------------------------------------------------------
const toast = (message, type = 'success') => {
  const node = el('div', { className: `toast toast--${type}`, role: type === 'error' ? 'alert' : 'status' },
    icon(type === 'success' ? 'check' : 'error'),
    el('span', {}, message));
  $('toasts').append(node);
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('is-shown')));
  setTimeout(() => {
    node.classList.remove('is-shown');
    setTimeout(() => node.remove(), 300);
  }, 4000);
};

const reportError = (error) => {
  if (!(error instanceof SessionExpiredError)) toast(t('errors.generic', { message: error.message }), 'error');
};

const setAlert = (box, textNode, message) => {
  textNode.textContent = message;
  box.hidden = !message;
};

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
const showApp = (signedIn) => {
  $('login-view').hidden = signedIn;
  $('app-view').hidden = !signedIn;
};

function signOut(message = '') {
  token = '';
  storage.clear();
  articles = [];
  $('news-grid').replaceChildren();
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  showApp(false);
  setAlert($('login-error'), $('login-error-text'), message);
  $('login-token').value = '';
  $('login-token').focus();
}

const showState = (state) => {
  $('loading-state').hidden = state !== 'loading';
  $('empty-state').hidden = state !== 'empty';
  $('error-state').hidden = state !== 'error';
  $('news-grid').hidden = state !== 'list';
};

const previewUrl = (image) => {
  if (!image) return '';
  if (image.startsWith('uploads/')) return new URL(`../${image}`, window.location.href).href;
  return /^https:\/\//i.test(image) ? image : '';
};

const articleCard = (article) => {
  const imageUrl = article.image_url || previewUrl(article.image);
  const image = imageUrl ? el('img', { className: 'card__image', src: imageUrl, alt: '', loading: 'lazy' }) : null;
  image?.addEventListener('error', () => image.remove());

  const edited = article.modified_at && article.modified_at !== article.created_at;
  const edit = el('button', { type: 'button', className: 'btn btn--primary btn--sm' }, icon('edit'), t('list.edit'));
  edit.addEventListener('click', () => openEditor(article));
  const remove = el('button', { type: 'button', className: 'btn btn--danger btn--sm', title: t('list.delete') }, icon('trash'));
  remove.setAttribute('aria-label', t('list.delete'));
  remove.addEventListener('click', () => confirmDelete(article));

  return el('article', { className: 'card glass' },
    image,
    el('h3', { className: 'card__title' }, article.title),
    el('p', { className: 'card__description' }, article.description),
    el('div', { className: 'card__meta' },
      el('div', { className: 'card__dates' },
        el('span', {}, t('list.created', { date: formatDate(article.created_at) })),
        edited ? el('span', {}, t('list.modified', { date: formatDate(article.modified_at) })) : null),
      article.url ? el('div', { className: 'card__link' }, icon('link'), el('span', { title: article.url }, article.url)) : null),
    el('div', { className: 'card__actions' }, edit, remove));
};

const renderArticles = () => {
  $('news-grid').replaceChildren(...articles.map(articleCard));
  showState(articles.length ? 'list' : 'empty');
};

const loadArticles = async () => {
  showState('loading');
  try {
    articles = (await api('admin/news')).news;
    renderArticles();
  } catch (error) {
    if (error instanceof SessionExpiredError) return;
    $('error-text').textContent = error.message;
    showState('error');
  }
};

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------
$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const candidate = $('login-token').value.trim();
  if (!candidate) return;

  let response;
  try {
    response = await fetch(new URL('admin/session', API_BASE), { headers: { authorization: `Bearer ${candidate}` } });
  } catch (error) {
    setAlert($('login-error'), $('login-error-text'), t('errors.generic', { message: error.message }));
    return;
  }

  if (!response.ok) {
    const message = response.status === 401
      ? t('login.invalid')
      : response.status === 429 ? t('login.too_many') : t('errors.generic', { message: `HTTP ${response.status}` });
    setAlert($('login-error'), $('login-error-text'), message);
    return;
  }

  token = candidate;
  storage.write(token, $('login-remember').checked);
  setAlert($('login-error'), $('login-error-text'), '');
  showApp(true);
  await loadArticles();
});

$('logout').addEventListener('click', () => signOut());
$('retry').addEventListener('click', () => loadArticles());

$('copy-feed').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(FEED_URL);
    toast(t('list.copied'));
  } catch {
    // No clipboard access (plain http, or permission refused): select it for Ctrl+C instead.
    getSelection().selectAllChildren($('feed-url'));
    toast(t('list.copy_manual'), 'error');
  }
});

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------
let editing = null;

const updateCounters = () => {
  $('title-counter').textContent = `${$('field-title').value.length}/120`;
  $('description-counter').textContent = `${$('field-description').value.length}/10000`;
};

const updatePreview = (url = previewUrl($('field-image').value.trim())) => {
  $('image-preview').hidden = !url;
  if (url) $('image-preview-img').src = url;
  else $('image-preview-img').removeAttribute('src');
};

const updateEditorLabels = () => {
  $('editor-title').textContent = editing ? t('editor.edit') : t('editor.new');
  $('editor-save').textContent = editing ? t('editor.update') : t('editor.create');
};

function openEditor(article = null) {
  editing = article;
  updateEditorLabels();
  $('field-title').value = article?.title ?? '';
  $('field-description').value = article?.description ?? '';
  $('field-image').value = article?.image ?? '';
  $('field-url').value = article?.url ?? '';
  setAlert($('editor-error'), $('editor-error-text'), '');
  updateCounters();
  updatePreview(article?.image_url || previewUrl(article?.image ?? ''));
  $('editor').showModal();
  $('field-title').focus();
}

for (const button of document.querySelectorAll('[data-action="new"]')) {
  button.addEventListener('click', () => openEditor());
}
for (const button of document.querySelectorAll('#editor [data-close]')) {
  button.addEventListener('click', () => $('editor').close());
}
// Clicking the dimmed backdrop closes a dialog, like clicking outside it.
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

$('field-title').addEventListener('input', updateCounters);
$('field-description').addEventListener('input', updateCounters);
$('field-image').addEventListener('input', () => updatePreview());
$('image-preview-img').addEventListener('error', () => {
  $('image-preview').hidden = true;
});

$('image-clear').addEventListener('click', () => {
  $('field-image').value = '';
  updatePreview('');
});

$('image-upload').addEventListener('click', () => $('image-file').click());

$('image-file').addEventListener('change', async () => {
  const file = $('image-file').files?.[0];
  $('image-file').value = '';
  if (!file) return;

  const button = $('image-upload');
  button.disabled = true;
  button.lastElementChild.textContent = t('editor.uploading');
  setAlert($('editor-error'), $('editor-error-text'), '');
  try {
    const result = await api('admin/images', { method: 'POST', body: file, headers: { 'content-type': file.type } });
    $('field-image').value = result.image;
    updatePreview(result.image_url);
  } catch (error) {
    if (!(error instanceof SessionExpiredError)) {
      setAlert($('editor-error'), $('editor-error-text'), t('errors.generic', { message: error.message }));
    }
  } finally {
    button.disabled = false;
    button.lastElementChild.textContent = t('editor.upload');
  }
});

$('editor-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    title: $('field-title').value.trim(),
    description: $('field-description').value.trim(),
    image: $('field-image').value.trim(),
    url: $('field-url').value.trim(),
  };
  if (!payload.title || !payload.description) {
    setAlert($('editor-error'), $('editor-error-text'), t('editor.required'));
    return;
  }

  const save = $('editor-save');
  save.disabled = true;
  try {
    await api(editing ? `admin/news/${editing.id}` : 'admin/news', {
      method: editing ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
    });
    $('editor').close();
    toast(editing ? t('editor.saved') : t('editor.created'));
    await loadArticles();
  } catch (error) {
    if (!(error instanceof SessionExpiredError)) {
      setAlert($('editor-error'), $('editor-error-text'), t('errors.generic', { message: error.message }));
    }
  } finally {
    save.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
let deleting = null;

function confirmDelete(article) {
  const dialog = $('confirm-delete');
  deleting = article;
  $('confirm-delete-text').textContent = t('delete.text', { title: article.title });
  dialog.returnValue = '';
  dialog.addEventListener('close', async () => {
    deleting = null;
    if (dialog.returnValue !== 'delete') return;
    try {
      await api(`admin/news/${article.id}`, { method: 'DELETE' });
      toast(t('delete.done'));
      await loadArticles();
    } catch (error) {
      reportError(error);
    }
  }, { once: true });
  dialog.showModal();
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------
/** Puts every label in the current language, including cards and open dialogs. */
const applyLanguage = () => {
  document.documentElement.lang = lang;
  document.title = t('page.title');
  dateFormat = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium' });
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  }
  $('logout').title = t('nav.logout');
  $('logout').setAttribute('aria-label', t('nav.logout'));
  for (const button of document.querySelectorAll('.modal__close')) {
    button.setAttribute('aria-label', t('common.close'));
  }
  updateEditorLabels();
  if (deleting) $('confirm-delete-text').textContent = t('delete.text', { title: deleting.title });
  if (!$('news-grid').hidden) renderArticles();
};

for (const button of document.querySelectorAll('[data-lang]')) {
  button.addEventListener('click', () => {
    if (button.dataset.lang === lang) return;
    lang = button.dataset.lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Not remembered, but still applied to this page.
    }
    applyLanguage();
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
applyLanguage();
$('feed-url').textContent = FEED_URL;

if (token) {
  showApp(true);
  loadArticles().catch(reportError);
} else {
  showApp(false);
  $('login-token').focus();
}
