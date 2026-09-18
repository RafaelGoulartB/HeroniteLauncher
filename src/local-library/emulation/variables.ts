import { basename, dirname, extname } from 'path'
import shlex from 'shlex'

export type LaunchVars = {
  ImagePath?: string
  ImageName?: string
  ImageNameNoExt?: string
  ImageDir?: string
  EmulatorDir?: string
  CorePath?: string
  Name?: string
  InstallDir?: string
}

export function varsForRom(args: {
  romPath: string
  emulatorDir?: string
  corePath?: string
  name?: string
}): LaunchVars {
  const { romPath } = args
  const fileName = basename(romPath)
  return {
    ImagePath: romPath,
    ImageName: fileName,
    ImageNameNoExt: fileName.slice(
      0,
      fileName.length - extname(fileName).length
    ),
    ImageDir: dirname(romPath),
    EmulatorDir: args.emulatorDir,
    CorePath: args.corePath,
    Name: args.name,
    InstallDir: args.emulatorDir
  }
}

export function expandTemplate(
  value: string | undefined,
  vars: LaunchVars
): string {
  if (!value) return ''
  let result = value
  for (const [key, replacement] of Object.entries(vars)) {
    if (!replacement) continue
    result = result.replaceAll(`{${key}}`, replacement)
  }
  return result
}

export function expandArgv(
  template: string | undefined,
  vars: LaunchVars
): string[] {
  const source = template?.trim()
  if (!source) return []
  let parts: string[]
  try {
    parts = shlex.split(source)
  } catch {
    parts = source.split(/\s+/).filter(Boolean)
  }
  return parts
    .map((part) => expandTemplate(part, vars))
    .filter((part) => part.length > 0)
}
