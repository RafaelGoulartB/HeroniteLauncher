import sanitizeHtml from 'sanitize-html'

export function sanitizeSteamDescription(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'title', 'width', 'height'],
      '*': ['class']
    },
    allowedSchemes: ['http', 'https'],
    transformTags: {
      img: (tagName, attribs) => {
        const src = attribs.src || ''
        return {
          tagName,
          attribs: {
            ...attribs,
            src: src.startsWith('//') ? `https:${src}` : src
          }
        }
      }
    }
  })
}
