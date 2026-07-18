function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function patternToRegExp(pattern: string): RegExp {
  const optionalPrefix = pattern.startsWith('**/');
  if (optionalPrefix) pattern = pattern.slice(3);
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escapeRegex(char ?? '');
    }
  }
  return new RegExp(`^${optionalPrefix ? '(?:.*/)?' : ''}${source}$`);
}

export function matchesAny(file: string, patterns: string[]): boolean {
  return patterns.some((pattern) => patternToRegExp(pattern).test(file));
}
