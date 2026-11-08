import crypto from 'node:crypto';

/** MD5 -> 小写 hex */
export const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

/**
 * 有道 Web 接口通用签名（bundle 里的 genSign）。
 *
 * 1. 删掉值为 "" / null / undefined 的字段
 * 2. 取所有 key 字典序升序排序，末尾追加 "key"
 * 3. 拼成 k1=v1&k2=v2&...&key=<secret>
 * 4. sign = md5(该字符串) 的小写 hex
 * 5. pointParam = 这些 key（含最后的 key）用 "," 连接
 *
 * @param {Record<string, any>} params
 * @param {string} secret
 * @returns {[string, string]} [sign, pointParam]
 */
export function genSign(params, secret) {
  const p = { ...params };
  for (const k of Object.keys(p)) {
    if (p[k] === '' || p[k] === null || p[k] === undefined) delete p[k];
  }
  const keys = Object.keys(p).sort();
  keys.push('key');
  p.key = secret;
  const str = keys.map((k) => `${k}=${p[k]}`).join('&');
  return [md5(str), keys.join(',')];
}

/** 每个接口都会带上的「设备身份」字段 */
export const IDENTITY = {
  appVersion: '12.0.0',
  client: 'web',
  mid: 1,
  vendor: 'web',
  screen: 1,
  model: 1,
  imei: 1,
  network: 'wifi',
};

/**
 * 生成带签名的完整参数（bundle 里的 genParamV3）。
 *
 * 签名参数永远以 secret 作为 key 参与计算，而不是字段里的 signSecretKey。
 *
 * @param {Record<string, any>} extra 接口私有字段
 * @param {string} secret 签名密钥
 * @param {string} keyid
 * @param {string} product
 * @param {string} keyfrom
 * @param {string|null} yduuid
 * @param {string} [client]
 * @param {string} [appVersion]
 */
export function genParamV3(
  extra,
  secret,
  keyid,
  product,
  keyfrom,
  yduuid,
  client = 'web',
  appVersion = IDENTITY.appVersion,
) {
  const p = {
    ...IDENTITY,
    appVersion,
    client,
    product,
    keyfrom,
    keyid,
    mysticTime: Date.now(),
    yduuid: yduuid || 'abcdefg',
    ...extra,
  };
  const [sign, pointParam] = genSign(p, secret);
  return { ...p, sign, pointParam };
}

/** 把参数对象转成 URL query（跳过 undefined / null） */
export function toQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

/** 把参数对象转成 FormData（跳过 undefined / null） */
export function toFormData(params) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    fd.append(k, String(v));
  }
  return fd;
}
