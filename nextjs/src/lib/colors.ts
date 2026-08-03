// Дизайн-токены Улкана (единый источник цвета). Скопировано дословно — это
// чистая палитра, не логика; вид интерфейса опирается на неё.
export const COLORS = {
  primary:     '#d4613a',
  primaryDark: '#c0532a',
  bg:          '#f1efec',
  white:       '#ffffff',
  dark:        '#211f1c',
  text:        '#26231f',
  textMuted:   '#5f5952',
  textSubtle:  '#6b645b',
  textLight:   '#837c72',
  border:      '#e6e2dc',
  borderLight: '#f1ede7',
  bgCard:      '#faf8f6',

  status: {
    waiting:   { bg: '#eef2ff', color: '#4a5aaa' },
    accepted:  { bg: '#fff0ea', color: '#c0532a' },
    ready:     { bg: '#fdf8e1', color: '#8a6f00' },
    delivered: { bg: '#e8f5ee', color: '#2e8a5e' },
    cancelled: { bg: '#faeaea', color: '#b03020' },
    draft:     { bg: '#efece8', color: '#6b655b' },
    archive:   { bg: '#eef2ff', color: '#4a5aaa' },
  },

  source: {
    cabinet:            { bg: '#eef2ff', color: '#4a5aaa' },
    external:           { bg: '#fff0ea', color: '#c0532a' },
    webhook:            { bg: '#f3eeff', color: '#7a3aaa' },
    admin_manual:       { bg: '#eef2ff', color: '#4a5aaa' },
    responsible_portal: { bg: '#e8f5ee', color: '#2e8a5e' },
  },

  progress: { low: '#d4613a', mid: '#c4a832', high: '#3a9d6e' },

  sidebar: {
    bg:     '#211f1c',
    text:   '#cfc9c0',
    muted:  '#8c857a',
    active: '#d4613a',
    border: '#322f2b',
    badge:  '#3a3631',
  },
}
