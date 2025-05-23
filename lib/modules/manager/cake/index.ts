import moo from 'moo';
import type { Category } from '../../../constants';
import { regEx } from '../../../util/regex';
import { isHttpUrl } from '../../../util/url';
import { NugetDatasource } from '../../datasource/nuget';
import type { PackageDependency, PackageFileContent } from '../types';

export const url = 'https://cakebuild.net/docs';
export const categories: Category[] = ['dotnet'];

export const defaultConfig = {
  managerFilePatterns: ['/\\.cake$/'],
};

export const supportedDatasources = [NugetDatasource.id];

const lexer = moo.states({
  main: {
    lineComment: { match: /\/\/.*?$/ }, // TODO #12870
    multiLineComment: { match: /\/\*[^]*?\*\//, lineBreaks: true }, // TODO #12870
    dependency: {
      match: /^#(?:addin|tool|module|load|l)\s+(?:nuget|dotnet):.*$/, // TODO #12870
    },
    dependencyQuoted: {
      match: /^#(?:addin|tool|module|load|l)\s+"(?:nuget|dotnet):[^"]+"\s*$/, // TODO #12870
      value: (s: string) => s.trim().slice(1, -1),
    },
    unknown: moo.fallback,
  },
});

function parseDependencyLine(line: string): PackageDependency | null {
  try {
    let url = line.replace(regEx(/^[^:]*:/), '');
    const isEmptyHost = url.startsWith('?');
    url = isEmptyHost ? `http://localhost/${url}` : url;

    const parsedUrl = new URL(url);
    const { origin, pathname, searchParams } = parsedUrl;

    const registryUrl = `${origin}${pathname}`;

    const depName = searchParams.get('package')!;
    const currentValue = searchParams.get('version') ?? undefined;

    const result: PackageDependency = {
      datasource: NugetDatasource.id,
      depName,
      currentValue,
    };

    if (!isEmptyHost) {
      if (isHttpUrl(parsedUrl)) {
        result.registryUrls = [registryUrl];
      } else {
        result.skipReason = 'unsupported-url';
      }
    }

    return result;
  } catch {
    return null;
  }
}

export function extractPackageFile(content: string): PackageFileContent {
  const deps: PackageDependency[] = [];
  lexer.reset(content);
  let token = lexer.next();
  while (token) {
    const { type, value } = token;
    if (type === 'dependency' || type === 'dependencyQuoted') {
      const dep = parseDependencyLine(value);
      if (dep) {
        deps.push(dep);
      }
    }
    token = lexer.next();
  }
  return { deps };
}
