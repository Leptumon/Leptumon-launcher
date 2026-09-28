/**
 * Checks article fields sent by the admin panel. Unknown fields are dropped.
 *
 * Articles are plain text: the launcher shows the description as-is, with its
 * line breaks, and never renders HTML from the feed.
 */
import { UPLOAD_NAME, UPLOAD_PREFIX } from './uploads.js';

export const LIMITS = {
  title: 120,
  description: 10_000,
  url: 2048,
};

/** The launcher only loads images and opens links over https, so plain http is refused here already. */
const isHttpsUrl = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const text = (value, field, max, errors, { required }) => {
  if (value === undefined || value === null) {
    if (required) errors.push(`${field} is required`);
    return undefined;
  }
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string`);
    return undefined;
  }
  const trimmed = value.replace(/\r\n?/g, '\n').trim();
  if (required && !trimmed) errors.push(`${field} is required`);
  if (trimmed.length > max) errors.push(`${field} must be at most ${max} characters`);
  return trimmed;
};

/**
 * Returns `{ fields, errors }`. With `partial`, missing fields are left out so an
 * update only changes what was sent; otherwise title and description are required.
 */
export const validateArticle = (body, { partial = false } = {}) => {
  const errors = [];
  const fields = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { fields, errors: ['Expected a JSON object'] };
  }

  const title = text(body.title, 'title', LIMITS.title, errors, { required: !partial });
  if (title !== undefined) fields.title = title;

  const description = text(body.description, 'description', LIMITS.description, errors, { required: !partial });
  if (description !== undefined) fields.description = description;

  const image = text(body.image, 'image', LIMITS.url, errors, { required: false });
  if (image !== undefined) {
    const isUpload = image.startsWith(UPLOAD_PREFIX) && UPLOAD_NAME.test(image.slice(UPLOAD_PREFIX.length));
    if (image && !isUpload && !isHttpsUrl(image)) {
      errors.push('image must be an https:// URL or an uploaded image');
    }
    fields.image = image;
  } else if (!partial) {
    fields.image = '';
  }

  const url = text(body.url, 'url', LIMITS.url, errors, { required: false });
  if (url !== undefined) {
    if (url && !isHttpsUrl(url)) errors.push('url must be an https:// link');
    fields.url = url;
  } else if (!partial) {
    fields.url = '';
  }

  return { fields, errors };
};
