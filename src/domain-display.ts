import {domainToUnicode} from 'node:url';

export function displayHost(host: string) {
 return domainToUnicode(host) || host;
}

export function displayOrigin(origin: string) {
 const url = new URL(origin);
 return `${url.protocol}//${displayHost(url.hostname)}${url.port ? ':' + url.port : ''}`;
}
