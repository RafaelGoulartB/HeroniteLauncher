import type { CompletionStatusSlug } from 'common/types/local-library'

export const STATUS_COLORS: Record<CompletionStatusSlug, string> = {
  playing: '#3ecf8e',
  'plan-to-play': '#6cb6ff',
  'on-hold': '#f0a202',
  played: '#8b9cff',
  endless: '#2ec4b6',
  beaten: '#f4d35e',
  completed: '#c084fc',
  abandoned: '#9aa0a6',
  'not-played': '#6b7280',
  custom: '#e5e7eb'
}
