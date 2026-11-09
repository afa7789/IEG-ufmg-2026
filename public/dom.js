export function el(tag, className, ...children) {
  const node = document.createElement(tag)
  if (className) node.className = className
  node.append(...children)
  return node
}

// Icon with a letter fallback when there is no image or it fails to load.
export function icon(src, label) {
  const fallback = () => el('span', 'icon icon-fallback', (label[0] ?? '?').toUpperCase())
  if (!src) return fallback()
  const img = Object.assign(el('img', 'icon'), { src, alt: '', loading: 'lazy' })
  img.addEventListener('error', () => img.replaceWith(fallback()))
  return img
}

export const chip = (src, text) => el('span', 'chip', icon(src, text), text)
