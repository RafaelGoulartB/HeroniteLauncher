import type {
  EmulatorDefinition,
  EmulatorDefinitionProfile
} from 'common/types/local-library'

function profile(
  id: string,
  name: string,
  platformId: string,
  platformName: string,
  extensions: string[],
  argumentsTemplate: string,
  extra?: Partial<EmulatorDefinitionProfile>
): EmulatorDefinitionProfile {
  return {
    id,
    name,
    platformId,
    platformName,
    extensions,
    arguments: argumentsTemplate,
    ...extra
  }
}

function retroArchCore(
  id: string,
  name: string,
  platformId: string,
  platformName: string,
  core: string,
  extensions: string[]
): EmulatorDefinitionProfile {
  return profile(
    id,
    name,
    platformId,
    platformName,
    extensions,
    '-L {CorePath} {ImagePath}',
    {
      core
    }
  )
}

const CART = ['zip', '7z']

export const EMULATOR_DEFINITIONS: EmulatorDefinition[] = [
  {
    id: 'dolphin',
    name: 'Dolphin',
    website: 'https://dolphin-emu.org/',
    binaries: ['dolphin-emu', 'dolphin'],
    flatpakId: 'org.DolphinEmu.dolphin-emu',
    stopPattern: 'dolphin-emu',
    profiles: [
      profile(
        'gamecube',
        'Nintendo GameCube',
        'nintendo_gamecube',
        'Nintendo GameCube',
        [
          'elf',
          'dol',
          'gcm',
          'tgc',
          'ciso',
          'gcz',
          'iso',
          'wad',
          'rvz',
          'wia',
          'm3u'
        ],
        '--exec={ImagePath} --batch',
        { playlistExtensions: ['m3u'] }
      ),
      profile(
        'wii',
        'Nintendo Wii',
        'nintendo_wii',
        'Nintendo Wii',
        [
          'elf',
          'dol',
          'tgc',
          'wbfs',
          'ciso',
          'gcz',
          'iso',
          'wad',
          'rvz',
          'wia',
          'm3u'
        ],
        '--exec={ImagePath} --batch',
        { playlistExtensions: ['m3u'] }
      )
    ]
  },
  {
    id: 'pcsx2',
    name: 'PCSX2',
    website: 'https://pcsx2.net/',
    binaries: ['pcsx2-qt', 'pcsx2'],
    flatpakId: 'net.pcsx2.PCSX2',
    stopPattern: 'pcsx2',
    profiles: [
      profile(
        'ps2',
        'PlayStation 2',
        'sony_playstation2',
        'PlayStation 2',
        ['iso', 'bin', 'mdf', 'img', 'chd', 'cso', 'gz', 'm3u'],
        '-fullscreen -slowboot -- {ImagePath}',
        { playlistExtensions: ['m3u', 'cue'] }
      )
    ]
  },
  {
    id: 'duckstation',
    name: 'DuckStation',
    website: 'https://www.duckstation.org/',
    binaries: ['duckstation-qt', 'duckstation'],
    flatpakId: 'org.duckstation.DuckStation',
    stopPattern: 'duckstation',
    profiles: [
      profile(
        'ps1',
        'PlayStation',
        'sony_playstation',
        'PlayStation',
        ['iso', 'bin', 'img', 'chd', 'pbp', 'ecm', 'm3u', 'cue'],
        '-batch -fullscreen {ImagePath}',
        { playlistExtensions: ['cue', 'm3u'] }
      )
    ]
  },
  {
    id: 'ppsspp',
    name: 'PPSSPP',
    website: 'https://www.ppsspp.org/',
    binaries: ['PPSSPPSDL', 'ppsspp', 'ppsspp-sdl'],
    flatpakId: 'org.ppsspp.PPSSPP',
    stopPattern: 'PPSSPP',
    profiles: [
      profile(
        'psp',
        'PlayStation Portable',
        'sony_psp',
        'PlayStation Portable',
        ['iso', 'cso', 'pbp', 'prx', 'elf', 'chd'],
        '{ImagePath}'
      )
    ]
  },
  {
    id: 'rpcs3',
    name: 'RPCS3',
    website: 'https://rpcs3.net/',
    binaries: ['rpcs3'],
    flatpakId: 'net.rpcs3.RPCS3',
    stopPattern: 'rpcs3',
    profiles: [
      profile(
        'ps3',
        'PlayStation 3',
        'sony_playstation3',
        'PlayStation 3',
        ['iso', 'pkg'],
        '{ImagePath}',
        { folderIndicator: 'EBOOT.BIN' }
      )
    ]
  },
  {
    id: 'cemu',
    name: 'Cemu',
    website: 'https://cemu.info/',
    binaries: ['cemu', 'Cemu'],
    flatpakId: 'info.cemu.Cemu',
    stopPattern: 'Cemu',
    profiles: [
      profile(
        'wiiu',
        'Nintendo Wii U',
        'nintendo_wiiu',
        'Nintendo Wii U',
        ['wud', 'wux', 'iso', 'wad', 'rpx', 'elf'],
        '-g {ImagePath} -f'
      )
    ]
  },
  {
    id: 'ryujinx',
    name: 'Ryujinx',
    website: 'https://ryujinx.org/',
    binaries: ['ryujinx', 'Ryujinx'],
    flatpakId: 'org.ryujinx.Ryujinx',
    stopPattern: 'Ryujinx',
    profiles: [
      profile(
        'switch',
        'Nintendo Switch',
        'nintendo_switch',
        'Nintendo Switch',
        ['nsp', 'xci', 'nca', 'nro', 'nso'],
        '{ImagePath}'
      )
    ]
  },
  {
    id: 'xemu',
    name: 'Xemu',
    website: 'https://xemu.app/',
    binaries: ['xemu'],
    flatpakId: 'app.xemu.xemu',
    stopPattern: 'xemu',
    profiles: [
      profile(
        'xbox',
        'Xbox',
        'microsoft_xbox',
        'Xbox',
        ['iso', 'xiso'],
        '-full-screen -dvd_path {ImagePath}'
      )
    ]
  },
  {
    id: 'melonds',
    name: 'melonDS',
    website: 'https://melonds.kuribo64.net/',
    binaries: ['melonDS', 'melonds'],
    flatpakId: 'net.kuribo64.melonDS',
    stopPattern: 'melonDS',
    profiles: [
      profile(
        'nds',
        'Nintendo DS',
        'nintendo_ds',
        'Nintendo DS',
        ['nds', 'dsi', 'ids', ...CART],
        '{ImagePath}'
      )
    ]
  },
  {
    id: 'mgba',
    name: 'mGBA',
    website: 'https://mgba.io/',
    binaries: ['mgba-qt', 'mgba'],
    flatpakId: 'io.mgba.mGBA',
    stopPattern: 'mgba',
    profiles: [
      profile(
        'gba',
        'Game Boy Advance',
        'nintendo_gameboyadvance',
        'Game Boy Advance',
        ['gba', 'agb', 'mb', 'bin', ...CART],
        '{ImagePath}'
      ),
      profile(
        'gb',
        'Game Boy / Color',
        'nintendo_gameboy',
        'Game Boy',
        ['gb', 'gbc', 'sgb', 'bin', ...CART],
        '{ImagePath}'
      )
    ]
  },
  {
    id: 'flycast',
    name: 'Flycast',
    website: 'https://github.com/flyinghead/flycast',
    binaries: ['flycast'],
    flatpakId: 'org.flycast.Flycast',
    stopPattern: 'flycast',
    profiles: [
      profile(
        'dreamcast',
        'Dreamcast',
        'sega_dreamcast',
        'Dreamcast',
        ['gdi', 'cdi', 'chd', 'cue', 'iso', 'm3u'],
        '{ImagePath}',
        { playlistExtensions: ['gdi', 'cue', 'm3u'] }
      )
    ]
  },
  {
    id: 'mame',
    name: 'MAME',
    website: 'https://www.mamedev.org/',
    binaries: ['mame', 'mame-mame'],
    flatpakId: 'org.mamedev.MAME',
    stopPattern: 'mame',
    profiles: [
      profile(
        'arcade',
        'Arcade',
        'arcade',
        'Arcade',
        ['zip', '7z'],
        '{ImageNameNoExt}',
        { workingDir: 'rom' }
      )
    ]
  },
  {
    id: 'scummvm',
    name: 'ScummVM',
    website: 'https://www.scummvm.org/',
    binaries: ['scummvm'],
    flatpakId: 'org.scummvm.ScummVM',
    stopPattern: 'scummvm',
    profiles: [
      profile('scumm', 'ScummVM', 'pc', 'PC', ['scummvm'], '-f {ImagePath}')
    ]
  },
  {
    id: 'vita3k',
    name: 'Vita3K',
    website: 'https://vita3k.org/',
    binaries: ['Vita3K', 'vita3k'],
    flatpakId: 'org.vita3k.Vita3K',
    stopPattern: 'Vita3K',
    profiles: [
      profile(
        'vita',
        'PlayStation Vita',
        'sony_psvita',
        'PlayStation Vita',
        ['vpk'],
        '{ImagePath}',
        { folderIndicator: 'eboot.bin' }
      )
    ]
  },
  {
    id: 'shadps4',
    name: 'shadPS4',
    website: 'https://shadps4.net/',
    binaries: ['shadps4', 'ShadPS4'],
    flatpakId: 'net.shadps4.shadPS4',
    stopPattern: 'shadps4',
    profiles: [
      profile(
        'ps4',
        'PlayStation 4',
        'sony_playstation4',
        'PlayStation 4',
        ['pkg'],
        '{ImagePath}',
        { folderIndicator: 'eboot.bin' }
      )
    ]
  },
  {
    id: 'azahar',
    name: 'Azahar',
    website: 'https://azahar-emu.org/',
    binaries: ['azahar', 'citra', 'citra-qt'],
    flatpakId: 'org.azahar_emu.Azahar',
    stopPattern: 'azahar',
    profiles: [
      profile(
        '3ds',
        'Nintendo 3DS',
        'nintendo_3ds',
        'Nintendo 3DS',
        ['3ds', '3dsx', 'cci', 'cxi', 'app', 'cia', ...CART],
        '{ImagePath}'
      )
    ]
  },
  {
    id: 'retroarch',
    name: 'RetroArch',
    website: 'https://www.retroarch.com/',
    binaries: ['retroarch'],
    flatpakId: 'org.libretro.RetroArch',
    stopPattern: 'retroarch',
    coreDirHints: [
      '/usr/lib/libretro',
      '/usr/lib64/libretro',
      '/usr/lib/x86_64-linux-gnu/libretro',
      '/usr/share/libretro/cores'
    ],
    profiles: [
      retroArchCore(
        'nes',
        'NES',
        'nintendo_nes',
        'Nintendo Entertainment System',
        'nestopia_libretro',
        ['nes', 'fds', 'unf', 'unif', ...CART]
      ),
      retroArchCore(
        'snes',
        'SNES',
        'nintendo_super_nes',
        'Super Nintendo',
        'snes9x_libretro',
        ['sfc', 'smc', 'swc', 'fig', 'bs', ...CART]
      ),
      retroArchCore(
        'gb',
        'Game Boy',
        'nintendo_gameboy',
        'Game Boy',
        'gambatte_libretro',
        ['gb', 'gbc', 'sgb', ...CART]
      ),
      retroArchCore(
        'gba',
        'Game Boy Advance',
        'nintendo_gameboyadvance',
        'Game Boy Advance',
        'mgba_libretro',
        ['gba', 'agb', 'mb', ...CART]
      ),
      retroArchCore(
        'n64',
        'Nintendo 64',
        'nintendo_64',
        'Nintendo 64',
        'mupen64plus_next_libretro',
        ['n64', 'v64', 'z64', ...CART]
      ),
      retroArchCore(
        'nds',
        'Nintendo DS',
        'nintendo_ds',
        'Nintendo DS',
        'melonds_libretro',
        ['nds', 'dsi', 'ids', ...CART]
      ),
      retroArchCore(
        'md',
        'Mega Drive / Genesis',
        'sega_genesis',
        'Mega Drive',
        'genesis_plus_gx_libretro',
        ['md', 'gen', 'smd', 'bin', ...CART]
      ),
      retroArchCore(
        'ms',
        'Master System',
        'sega_master_system',
        'Master System',
        'genesis_plus_gx_libretro',
        ['sms', 'bin', ...CART]
      ),
      retroArchCore(
        'gg',
        'Game Gear',
        'sega_gamegear',
        'Game Gear',
        'genesis_plus_gx_libretro',
        ['gg', 'bin', ...CART]
      ),
      retroArchCore(
        'saturn',
        'Saturn',
        'sega_saturn',
        'Sega Saturn',
        'mednafen_saturn_libretro',
        ['cue', 'chd', 'iso', 'm3u']
      ),
      retroArchCore(
        'dc',
        'Dreamcast',
        'sega_dreamcast',
        'Dreamcast',
        'flycast_libretro',
        ['gdi', 'cdi', 'chd', 'cue', 'm3u']
      ),
      retroArchCore(
        'ps1',
        'PlayStation',
        'sony_playstation',
        'PlayStation',
        'pcsx_rearmed_libretro',
        ['cue', 'bin', 'iso', 'chd', 'pbp', 'm3u']
      ),
      retroArchCore(
        'psp',
        'PSP',
        'sony_psp',
        'PlayStation Portable',
        'ppsspp_libretro',
        ['iso', 'cso', 'pbp', 'chd']
      ),
      retroArchCore(
        'pce',
        'PC Engine',
        'nec_turbografx_16',
        'PC Engine',
        'mednafen_pce_fast_libretro',
        ['pce', 'cue', 'chd', 'sgx', ...CART]
      ),
      retroArchCore(
        'ngp',
        'Neo Geo Pocket',
        'snk_neogeopocket',
        'Neo Geo Pocket',
        'mednafen_ngp_libretro',
        ['ngp', 'ngc', 'ngpc', ...CART]
      ),
      retroArchCore(
        'wswan',
        'WonderSwan',
        'bandai_wonderswan',
        'WonderSwan',
        'mednafen_wswan_libretro',
        ['ws', 'wsc', ...CART]
      ),
      retroArchCore(
        'lynx',
        'Atari Lynx',
        'atari_lynx',
        'Atari Lynx',
        'mednafen_lynx_libretro',
        ['lnx', 'lyx', ...CART]
      ),
      retroArchCore(
        'a2600',
        'Atari 2600',
        'atari_2600',
        'Atari 2600',
        'stella_libretro',
        ['a26', 'bin', ...CART]
      ),
      retroArchCore('arcade', 'Arcade', 'arcade', 'Arcade', 'fbneo_libretro', [
        'zip',
        '7z'
      ]),
      retroArchCore('mame', 'MAME', 'arcade', 'Arcade', 'mame_libretro', [
        'zip',
        '7z'
      ])
    ]
  },
  {
    id: 'custom',
    name: 'Custom',
    binaries: [],
    profiles: [profile('custom', 'Custom', 'other', 'Other', [], '{ImagePath}')]
  }
]

const byId = new Map(EMULATOR_DEFINITIONS.map((item) => [item.id, item]))

export function getEmulatorDefinitions(): EmulatorDefinition[] {
  return EMULATOR_DEFINITIONS
}

export function getEmulatorDefinition(
  id: string
): EmulatorDefinition | undefined {
  return byId.get(id)
}

export function getDefinitionProfile(
  definitionId: string,
  profileId: string
): EmulatorDefinitionProfile | undefined {
  return getEmulatorDefinition(definitionId)?.profiles.find(
    (item) => item.id === profileId
  )
}

export function guessDefinitionId(name?: string): string {
  const normalized = (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (!normalized) return 'custom'
  const aliases: Array<[string, string]> = [
    ['retroarch', 'retroarch'],
    ['dolphin', 'dolphin'],
    ['pcsx2', 'pcsx2'],
    ['duckstation', 'duckstation'],
    ['ppsspp', 'ppsspp'],
    ['rpcs3', 'rpcs3'],
    ['cemu', 'cemu'],
    ['ryujinx', 'ryujinx'],
    ['xemu', 'xemu'],
    ['melonds', 'melonds'],
    ['mgba', 'mgba'],
    ['flycast', 'flycast'],
    ['mame', 'mame'],
    ['scummvm', 'scummvm'],
    ['vita3k', 'vita3k'],
    ['shadps4', 'shadps4'],
    ['azahar', 'azahar'],
    ['citra', 'azahar']
  ]
  for (const [needle, id] of aliases) {
    if (normalized.includes(needle)) return id
  }
  return 'custom'
}
