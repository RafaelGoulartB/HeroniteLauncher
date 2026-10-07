import {
  howLongToBeatSearchTerms,
  normalizeHowLongToBeatTitle,
  pickHowLongToBeatSearchMatch,
  secondsToHours
} from '../utils'

describe('HowLongToBeat helpers', () => {
  test('converts seconds to fractional hours', () => {
    expect(secondsToHours(0)).toBe(0)
    expect(secondsToHours(undefined)).toBe(0)
    expect(secondsToHours(115380)).toBeCloseTo(32.05)
  })

  test('normalizes titles for matching', () => {
    expect(normalizeHowLongToBeatTitle('The Witcher 3: Wild Hunt')).toBe(
      'thewitcher3wildhunt'
    )
  })

  test('prefers an exact title match over the first result', () => {
    const match = pickHowLongToBeatSearchMatch('Hades', [
      {
        game_id: 2,
        game_name: 'Hades II',
        game_type: 'game',
        comp_main: 3600
      },
      {
        game_id: 1,
        game_name: 'Hades',
        game_type: 'game',
        comp_main: 7200
      }
    ])
    expect(match?.game_id).toBe(1)
  })

  test('matches hyphen and colon title variants', () => {
    const match = pickHowLongToBeatSearchMatch(
      'Ori and the Blind Forest - Definitive Edition',
      [
        {
          game_id: 36755,
          game_name: 'Ori and the Blind Forest: Definitive Edition',
          game_type: 'game',
          comp_main: 32693
        }
      ]
    )
    expect(match?.game_id).toBe(36755)
  })

  test('drops punctuation from search terms', () => {
    expect(
      howLongToBeatSearchTerms('Ori and the Blind Forest - Definitive Edition')
    ).toEqual(['Ori', 'and', 'the', 'Blind', 'Forest', 'Definitive', 'Edition'])
    expect(howLongToBeatSearchTerms('Kingdom Come: Deliverance')).toEqual([
      'Kingdom',
      'Come',
      'Deliverance'
    ])
  })

  test('ignores DLC when a base game is present', () => {
    const match = pickHowLongToBeatSearchMatch('Elden Ring', [
      {
        game_id: 3,
        game_name: 'Elden Ring: Shadow of the Erdtree',
        game_type: 'dlc',
        comp_main: 1000
      },
      {
        game_id: 1,
        game_name: 'Elden Ring',
        game_type: 'game',
        comp_main: 2000
      }
    ])
    expect(match?.game_id).toBe(1)
  })
})
