/**
 * waitry-webhook
 *
 * Recibe POSTs del POS Waitry con cada pedido/actualización.
 * Flujo:
 *   1. Persiste el payload crudo en rdb.waitry_inbound (audit trail + retry).
 *   2. Desgloza a rdb.waitry_pedidos / _productos / _pagos.
 *   3. Espeja a Coda (grids pedidos/productos/pagos) vía Coda API.
 *
 * Exportado al repo 2026-04-17 desde Supabase Dashboard (v18, ezbr_sha256 cc3808c7...).
 * Verify JWT: false (Waitry no envía bearer; se valida por el path secreto).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CODA_API_BASE = 'https://coda.io/apis/v1';
const CODA_DOC_ID = 'yvrM3UilPt';
const CODA_TABLES = {
  pedidos: 'grid-qrrVxRy-_F',
  productos: 'grid-JR7mvLylN_',
  pagos: 'grid-NVkBKyMZAd',
};

const PEDIDOS_COLS = {
  IDPEDIDO: 'c-c5XrezM2oo',
  STATUS: 'c-xbkZ__XlCn',
  PAID: 'c-MVL9iNtzDN',
  TIMESTAMP: 'c-9e3LGnM8Xt',
  PLACEID: 'c-1love2nACV',
  PLACENAME: 'c-PSR2hD-Bgd',
  TABLENAME: 'c-G1M9EA9UnI',
  LAYOUTNAME: 'c-VG6OClX0SJ',
  TOTALAMOUNT: 'c-F1bs1TAYEe',
  TOTALDISCOUNT: 'c-gf0_uIbSrU',
  SERVICECHARGE: 'c-xCAZbSULl1',
  TAX: 'c-T_5TNYryCM',
  EXTDELIVERYID: 'c-JtXbilGjP9',
  NOTES: 'c-bViSP899JZ',
  LASTACTIONAT: 'c-XQ-c9WPDD5',
} as const;

const PRODUCTOS_COLS = {
  PK: 'c-Vz_DvOHrnr',
  IDPEDIDO: 'c-8BiNoBFp3J',
  ITEMID: 'c-R3oGZGYXmj',
  NOMBRE: 'c--crdKQfErD',
  CANTIDAD: 'c-Bd5BfhWt--',
  PRECIO: 'c-th_hOTIDhk',
  DISCOUNTPRICE: 'c-feUk588nG3',
  SUBTOTAL: 'c-DFU8inaAyP',
  CANCELADO: 'c-yh4CA1bvYC',
  TIMESTAMP: 'c-2NBuwn9z7i',
  USUARIO: 'c-E9ZG50UuaC',
} as const;

const PAGOS_COLS = {
  PK: 'c-Sielbb-7s8',
  IDPEDIDO: 'c-rCZLJSEYAl',
  GATEWAY: 'c-mYztdmvKfT',
  METHOD: 'c--r7N1AJn1t',
  AMOUNT: 'c-cCW_YxwB72',
  STATUS: 'c-0AAz8tyBGv',
  CREATEDAT: 'c-m4D-2Yqubc',
  ESREFUND: 'c-QpwfCbA3KO',
} as const;

type Json = Record<string, any>;

function j(v: unknown) {
  if (!v) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return typeof v === 'object' ? v : null;
}

function unwrapPayload(raw: any): any {
  if (typeof raw === 'string') {
    const parsed = j(raw);
    return parsed ? unwrapPayload(parsed) : raw;
  }
  if (!raw || typeof raw !== 'object') return raw;
  const candidates = [
    raw.payload,
    raw.body,
    raw.data,
    raw.message,
    typeof raw.payload === 'string' ? j(raw.payload) : null,
    typeof raw.body === 'string' ? j(raw.body) : null,
    typeof raw.data === 'string' ? j(raw.data) : null,
  ].filter(Boolean);
  return candidates[0] || raw;
}

function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      const found = v.find((x) => x != null && String(x).trim() !== '');
      if (found != null && String(found).trim() !== '') return String(found).trim();
      continue;
    }
    const s = String(v).trim();
    if (s) return s;
  }
  return undefined;
}

function zonedDateTimeToUtcIso(raw: string, timeZone: string): string | null {
  const match = String(raw)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!match) return null;

  const [, y, m, d, hh, mm, ss] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const hour = Number(hh);
  const minute = Number(mm);
  const second = Number(ss);
  const target = Date.UTC(year, month - 1, day, hour, minute, second);

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  let guess = target;

  for (let i = 0; i < 5; i += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const observed = Date.UTC(
      Number(lookup.year),
      Number(lookup.month) - 1,
      Number(lookup.day),
      Number(lookup.hour),
      Number(lookup.minute),
      Number(lookup.second)
    );
    const delta = target - observed;
    guess += delta;
    if (delta === 0) break;
  }

  return new Date(guess).toISOString();
}

function toISOFromAR(src: any): string | null {
  if (src == null) return null;

  if (typeof src === 'object') {
    const date =
      src.date || src.datetime || src.timestamp || src.createdAt || src.updatedAt || null;
    const timeZone = src.timezone || src.timeZone || 'America/Argentina/Buenos_Aires';
    if (!date) return null;
    return zonedDateTimeToUtcIso(String(date), String(timeZone)) ?? null;
  }

  const s = String(src).trim();
  if (!s) return null;
  if (/Z$|[+\-]\d{2}:\d{2}$/.test(s)) return s.includes('T') ? s : s.replace(' ', 'T');
  return zonedDateTimeToUtcIso(s, 'America/Argentina/Buenos_Aires');
}

function flattenNotes(x: any): string | undefined {
  if (x == null) return undefined;
  if (Array.isArray(x)) {
    const parts = x.map(flattenNotes).filter(Boolean);
    return parts.length ? parts.join(' | ') : undefined;
  }
  if (typeof x === 'object')
    return flattenNotes(x.text ?? x.note ?? x.notes ?? x.comment ?? x.comments);
  const s = String(x).trim();
  return s || undefined;
}

function computeOrderId(p: any) {
  return p?.orderId ?? p?.order?.id ?? p?.id ?? p?.orderID ?? p?.OrderId ?? null;
}

function computeExternalDeliveryId(p: any) {
  return firstNonEmpty(
    p?.externalDeliveryId,
    p?.delivery?.externalId,
    p?.delivery?.externalDeliveryId,
    p?.delivery?.id,
    p?.deliveryId,
    p?.externalId,
    p?.order?.externalDeliveryId,
    p?.order?.delivery?.externalId,
    p?.order?.deliveryId,
    p?.order?.externalId,
    p?.meta?.externalDeliveryId,
    p?.meta?.externalId,
    p?.options?.externalDeliveryId,
    p?.options?.externalId
  );
}

function computeNotes(p: any) {
  return flattenNotes(
    firstNonEmpty(
      p?.notes,
      p?.note,
      p?.comments,
      p?.comment,
      p?.customerNote,
      p?.customerNotes,
      p?.orderNotes,
      p?.kitchenNotes,
      p?.deliveryNotes,
      p?.specialInstructions,
      p?.instructions,
      p?.observations,
      p?.observation,
      p?.posNote,
      p?.posNotes,
      p?.order?.notes,
      p?.order?.note,
      p?.order?.comments,
      p?.order?.comment,
      p?.table?.note,
      p?.table?.notes,
      p?.place?.note,
      p?.place?.notes,
      p?.meta?.notes,
      p?.meta?.note,
      p?.extra?.notes,
      p?.extra?.note
    )
  );
}

function computeLastActionAt(p: any) {
  const unwrap = (x: any) =>
    x && typeof x === 'object' && (x.date || x.datetime || x.timestamp)
      ? x.date || x.datetime || x.timestamp
      : x;
  const list = []
    .concat(
      Array.isArray(p?.orderActions)
        ? p.orderActions.flatMap((a: any) => [
            unwrap(a?.timestamp),
            unwrap(a?.createdAt),
            unwrap(a?.actionDate),
          ])
        : []
    )
    .concat(Array.isArray(p?.actions) ? p.actions.map((a: any) => unwrap(a?.timestamp)) : [])
    .concat([
      unwrap(p?.lastActionAt),
      unwrap(p?.updatedAt),
      unwrap(p?.statusChangedAt),
      unwrap(p?.stateChangedAt),
    ])
    .concat([
      unwrap(p?.order?.lastActionAt),
      unwrap(p?.order?.updatedAt),
      unwrap(p?.order?.closedAt),
    ])
    .concat([unwrap(p?.timestamp), unwrap(p?.createdAt)]);
  const norm = list.map(toISOFromAR).filter(Boolean) as string[];
  if (!norm.length) return null;
  return norm.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
}

function normalizeName(n: any) {
  if (n == null) return undefined;
  const s = String(n).trim();
  return s || undefined;
}

function nameFromPerson(person: any) {
  if (!person || typeof person !== 'object') return undefined;
  const direct = normalizeName(
    person.fullName ?? person.fullname ?? person.displayName ?? person.name
  );
  if (direct) return direct;
  const first =
    person.firstName ?? person.firstname ?? person.givenName ?? person.given_name ?? person.name;
  const last = person.lastName ?? person.lastname ?? person.familyName ?? person.family_name;
  return normalizeName(`${first ?? ''} ${last ?? ''}`.trim());
}

function nameFromObj(o: any) {
  if (!o || typeof o !== 'object') return undefined;
  const personName = nameFromPerson(o.person);
  if (personName) return personName;
  const direct = normalizeName(
    o.name ??
      o.fullName ??
      o.fullname ??
      o.displayName ??
      o.username ??
      o.userName ??
      o.operatorName ??
      o.staffName ??
      o.employeeName
  );
  if (direct) return direct;
  const first = o.firstName ?? o.firstname ?? o.givenName ?? o.given_name ?? o.nameFirst;
  const last = o.lastName ?? o.lastname ?? o.familyName ?? o.family_name ?? o.nameLast;
  return normalizeName(`${first ?? ''} ${last ?? ''}`.trim());
}

function computeUser(it: any, p: any) {
  const direct = normalizeName(
    it?.userName ??
      it?.username ??
      it?.addedByName ??
      it?.createdByName ??
      it?.updatedByName ??
      p?.userName ??
      p?.username ??
      p?.createdByName ??
      p?.updatedByName
  );
  if (direct) return direct;
  const itemCandidates = [
    it?.user,
    it?.addedBy,
    it?.addedByUser,
    it?.createdBy,
    it?.updatedBy,
    it?.employee,
    it?.staff,
    it?.waiter,
    it?.server,
    it?.cashier,
    it?.attendant,
    it?.operator,
    it?.owner,
  ];
  for (const o of itemCandidates) {
    const n = nameFromObj(o);
    if (n) return n;
  }
  const payloadCandidates = [
    p?.user,
    p?.createdBy,
    p?.updatedBy,
    p?.waiter,
    p?.server,
    p?.cashier,
    p?.attendant,
    p?.operator,
    p?.owner,
    p?.order?.user,
    p?.order?.createdBy,
    p?.order?.updatedBy,
    p?.order?.waiter,
  ];
  for (const o of payloadCandidates) {
    const n = nameFromObj(o);
    if (n) return n;
  }
  return undefined;
}

function strHasCancelish(x: any) {
  if (!x) return false;
  const s = String(x).toLowerCase();
  return s.includes('cancel') || s.includes('anul') || s.includes('void') || s.includes('anulad');
}

function isOrderCancelled(p: any) {
  if (
    [
      p?.cancelled,
      p?.canceled,
      p?.isCancelled,
      p?.isCanceled,
      p?.order?.cancelled,
      p?.order?.canceled,
    ].some(Boolean)
  )
    return true;
  if ([p?.event, p?.status, p?.state, p?.order?.status, p?.order?.state].some(strHasCancelish))
    return true;
  const acts = Array.isArray(p?.orderActions) ? p.orderActions : [];
  return acts.some(
    (a: any) =>
      strHasCancelish(a?.orderActionType?.name) ||
      strHasCancelish(a?.type) ||
      strHasCancelish(a?.name)
  );
}

function isItemCancelled(it: any, p: any) {
  if (
    [
      it?.void,
      it?.isVoid,
      it?.cancelled,
      it?.canceled,
      it?.isCancelled,
      it?.isCanceled,
      !!it?.deletedAt,
      !!it?.removedAt,
      !!it?.removed,
    ].some(Boolean)
  )
    return true;
  if ([it?.status, it?.state, it?.action, it?.reason].some(strHasCancelish)) return true;
  return isOrderCancelled(p);
}

function cell(column: string, value: unknown) {
  if (!column || value === undefined || value === null) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return { column, value };
}

function compactCells(cells: Array<{ column: string; value: unknown } | null>) {
  return cells.filter(Boolean) as Array<{ column: string; value: unknown }>;
}

function mapPedidoRow(p: any) {
  const orderId = String(computeOrderId(p) ?? '');
  if (!orderId) return null;
  return {
    cells: compactCells([
      cell(PEDIDOS_COLS.IDPEDIDO, orderId),
      cell(
        PEDIDOS_COLS.STATUS,
        p?.event ??
          p?.status ??
          p?.state ??
          (Array.isArray(p?.orderActions) && p.orderActions[0]?.orderActionType?.name)
      ),
      cell(PEDIDOS_COLS.PAID, !!(p?.paid ?? p?.isPaid)),
      cell(
        PEDIDOS_COLS.TIMESTAMP,
        toISOFromAR(p?.timestamp?.date ?? p?.timestamp ?? p?.createdAt ?? p?.order?.createdAt)
      ),
      cell(
        PEDIDOS_COLS.PLACEID,
        p?.table?.place?.placeId ?? p?.place?.placeId ?? p?.placeId ?? p?.place?.id
      ),
      cell(
        PEDIDOS_COLS.PLACENAME,
        p?.table?.place?.name ?? p?.place?.name ?? p?.placeName ?? p?.venueName
      ),
      cell(PEDIDOS_COLS.TABLENAME, p?.table?.name ?? p?.posName ?? p?.table?.tableName),
      cell(PEDIDOS_COLS.LAYOUTNAME, p?.table?.layout?.name ?? p?.layoutName),
      cell(PEDIDOS_COLS.TOTALAMOUNT, p?.totalAmount ?? p?.totals?.total ?? p?.order?.total),
      cell(PEDIDOS_COLS.TOTALDISCOUNT, p?.totalDiscount ?? p?.totals?.discount),
      cell(
        PEDIDOS_COLS.SERVICECHARGE,
        p?.serviceCharge ?? p?.serviceChargeAmount ?? p?.totals?.service
      ),
      cell(PEDIDOS_COLS.TAX, p?.table?.place?.tax ?? p?.totals?.tax),
      cell(PEDIDOS_COLS.EXTDELIVERYID, computeExternalDeliveryId(p)),
      cell(PEDIDOS_COLS.NOTES, computeNotes(p)),
      cell(PEDIDOS_COLS.LASTACTIONAT, computeLastActionAt(p)),
    ]),
  };
}

function mapProductoRows(p: any) {
  const orderId = String(computeOrderId(p) ?? '');
  if (!orderId) return [];
  const items = []
    .concat(Array.isArray(p?.order?.items) ? p.order.items : [])
    .concat(Array.isArray(p?.items) ? p.items : [])
    .concat(Array.isArray(p?.orderItems) ? p.orderItems : [])
    .concat(Array.isArray(p?.order?.orderItems) ? p.order.orderItems : []);

  const rows: Array<{ cells: Array<{ column: string; value: unknown }> }> = [];

  items.forEach((it: any, idx: number) => {
    const rawId = it?.orderItemId ?? it?.id ?? it?.itemId ?? `noid-${idx}`;
    const qty = Number(it?.quantity ?? it?.count ?? 1);
    const baseUnit = Number(it?.item?.price ?? 0);
    const unitListed = Number(typeof it?.price === 'number' ? it.price : baseUnit);
    const unitDisc = Number(typeof it?.discountPrice === 'number' ? it.discountPrice : NaN);
    const canceled = isItemCancelled(it, p);
    const tsLocal = toISOFromAR(it?.timestamp?.date ?? it?.timestamp ?? it?.createdAt);
    const user = computeUser(it, p);
    const variations = Array.isArray(it?.orderItemVariations) ? it.orderItemVariations : [];

    let baseSubtotal: number | undefined;

    if (variations.length === 0) {
      const effectiveUnit = Number.isFinite(unitDisc)
        ? unitDisc
        : Number.isFinite(unitListed)
          ? unitListed
          : baseUnit;
      baseSubtotal = Number.isFinite(effectiveUnit) ? effectiveUnit * qty : undefined;
    } else {
      const baseAmount0 = (Number.isFinite(baseUnit) ? baseUnit : 0) * qty;
      const totalBefore =
        (Number.isFinite(unitListed) ? unitListed : Number.isFinite(baseUnit) ? baseUnit : 0) * qty;
      const varAmount0 = Math.max(0, totalBefore - baseAmount0);
      const totalAfter = Number.isFinite(unitDisc) ? unitDisc * qty : totalBefore;
      const discTotal = Math.max(0, totalBefore - totalAfter);
      const total0 = baseAmount0 + varAmount0;
      let baseFinal = baseAmount0;
      let varFinal = varAmount0;

      if (total0 > 0 && discTotal > 0) {
        const rateBase = baseAmount0 / total0;
        const rateVar = varAmount0 / total0;
        baseFinal = Math.max(0, baseAmount0 - discTotal * rateBase);
        varFinal = Math.max(0, varAmount0 - discTotal * rateVar);
      }

      baseSubtotal = baseFinal;

      const perVarTotal = variations.length > 0 ? varFinal / variations.length : 0;
      const unitVar = qty > 0 && variations.length > 0 ? perVarTotal / qty : 0;

      variations.forEach((v: any, j: number) => {
        const vId = v?.orderItemVariationId ?? v?.id ?? `var-${idx}-${j}`;
        const vName = v?.itemVariation?.item?.name ?? v?.itemVariation?.name ?? 'Variación';
        rows.push({
          cells: compactCells([
            cell(PRODUCTOS_COLS.PK, `${orderId}:${rawId}:var:${vId}`),
            cell(PRODUCTOS_COLS.IDPEDIDO, orderId),
            cell(PRODUCTOS_COLS.ITEMID, rawId),
            cell(PRODUCTOS_COLS.NOMBRE, vName),
            cell(PRODUCTOS_COLS.CANTIDAD, qty),
            cell(PRODUCTOS_COLS.PRECIO, unitVar),
            cell(PRODUCTOS_COLS.SUBTOTAL, perVarTotal),
            cell(PRODUCTOS_COLS.CANCELADO, canceled),
            cell(PRODUCTOS_COLS.TIMESTAMP, tsLocal),
          ]),
        });
      });
    }

    rows.push({
      cells: compactCells([
        cell(PRODUCTOS_COLS.PK, `${orderId}:${rawId}`),
        cell(PRODUCTOS_COLS.IDPEDIDO, orderId),
        cell(PRODUCTOS_COLS.ITEMID, rawId),
        cell(PRODUCTOS_COLS.NOMBRE, it?.productName ?? it?.name ?? it?.item?.name),
        cell(PRODUCTOS_COLS.CANTIDAD, it?.quantity ?? it?.count),
        cell(PRODUCTOS_COLS.PRECIO, it?.price ?? it?.item?.price),
        cell(PRODUCTOS_COLS.DISCOUNTPRICE, it?.discountPrice),
        cell(PRODUCTOS_COLS.SUBTOTAL, baseSubtotal),
        cell(PRODUCTOS_COLS.CANCELADO, canceled),
        cell(PRODUCTOS_COLS.TIMESTAMP, tsLocal),
        cell(PRODUCTOS_COLS.USUARIO, user),
      ]),
    });
  });

  return rows.filter((r) => r.cells.length > 0);
}

function mapPagoRows(p: any) {
  const orderId = String(computeOrderId(p) ?? '');
  if (!orderId) return [];
  const pays = []
    .concat(Array.isArray(p?.payments) ? p.payments : [])
    .concat(Array.isArray(p?.orderPayments) ? p.orderPayments : [])
    .concat(Array.isArray(p?.order?.payments) ? p.order.payments : []);

  return pays
    .map((pay: any, idx: number) => {
      const paymentId = pay?.paymentId ?? pay?.id ?? pay?.orderPaymentId ?? `noid-${idx}`;
      const amount =
        typeof pay?.amount === 'number'
          ? pay.amount
          : typeof pay?.total === 'number'
            ? pay.total
            : undefined;
      const esRefund = typeof amount === 'number' ? amount < 0 : !!pay?.isRefund;
      return {
        cells: compactCells([
          cell(PAGOS_COLS.PK, `${orderId}:${paymentId}`),
          cell(PAGOS_COLS.IDPEDIDO, orderId),
          cell(PAGOS_COLS.GATEWAY, pay?.gateway ?? pay?.processor ?? pay?.source),
          cell(PAGOS_COLS.METHOD, pay?.method ?? pay?.type ?? pay?.paymentType?.name),
          cell(PAGOS_COLS.AMOUNT, amount),
          cell(PAGOS_COLS.STATUS, pay?.status),
          cell(
            PAGOS_COLS.CREATEDAT,
            toISOFromAR(
              pay?.createdAt?.date ?? pay?.createdAt ?? pay?.timestamp?.date ?? pay?.timestamp
            )
          ),
          cell(PAGOS_COLS.ESREFUND, esRefund),
        ]),
      };
    })
    .filter((r) => r.cells.length > 0);
}

function buildRdbPedidoRow(p: any) {
  const orderId = String(computeOrderId(p) ?? '');
  if (!orderId) return null;

  return {
    order_id: orderId,
    status: p?.event ?? p?.status ?? p?.state ?? null,
    paid: !!(p?.paid ?? p?.isPaid),
    timestamp: toISOFromAR(p?.timestamp),
    place_id: p?.table?.place?.placeId ?? p?.place?.placeId ?? p?.placeId ?? p?.place?.id ?? null,
    place_name: p?.table?.place?.name ?? p?.place?.name ?? p?.placeName ?? p?.venueName ?? null,
    table_name: p?.table?.name ?? p?.posName ?? p?.table?.tableName ?? null,
    layout_name: p?.table?.layout?.name ?? p?.layoutName ?? null,
    total_amount: p?.totalAmount ?? p?.totals?.total ?? p?.order?.total ?? null,
    total_discount: p?.totalDiscount ?? p?.totals?.discount ?? null,
    service_charge: p?.serviceCharge ?? p?.serviceChargeAmount ?? p?.totals?.service ?? null,
    tax: p?.table?.place?.tax ?? p?.totals?.tax ?? p?.tax ?? null,
    external_delivery_id: computeExternalDeliveryId(p) ?? null,
    notes: computeNotes(p) ?? null,
    last_action_at: computeLastActionAt(p),
    updated_at: new Date().toISOString(),
  };
}

function buildRdbProductoRows(p: any) {
  const orderId = String(computeOrderId(p) ?? '');
  if (!orderId) return [];

  const items = []
    .concat(Array.isArray(p?.orderItems) ? p.orderItems : [])
    .concat(Array.isArray(p?.items) ? p.items : [])
    .concat(Array.isArray(p?.order?.items) ? p.order.items : [])
    .concat(Array.isArray(p?.order?.orderItems) ? p.order.orderItems : []);

  const deduped = new Map<string, any>();

  items
    .filter((item: any) => !isItemCancelled(item, p))
    .forEach((item: any, idx: number) => {
      const productId = item?.item?.itemId ?? item?.itemId ?? item?.productId ?? `noid-${idx}`;
      const productName = item?.item?.name ?? item?.name ?? item?.productName;
      if (!productName) return;

      const quantity = Number(item?.count ?? item?.quantity ?? 1);
      const unitPrice = Number.isFinite(Number(item?.discountPrice))
        ? Number(item.discountPrice)
        : Number.isFinite(Number(item?.item?.price))
          ? Number(item.item.price)
          : Number.isFinite(Number(item?.price))
            ? Number(item.price)
            : null;
      const totalPrice = Number.isFinite(Number(item?.subtotal))
        ? Number(item.subtotal)
        : unitPrice != null
          ? quantity * unitPrice
          : null;

      deduped.set(`${orderId}::${String(productId)}::${String(productName)}`, {
        order_id: orderId,
        product_id: String(productId),
        product_name: String(productName),
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        notes: flattenNotes(item?.notes) ?? null,
      });
    });

  return Array.from(deduped.values());
}

function buildRdbPagoRows(p: any) {
  const orderId = String(computeOrderId(p) ?? '');
  if (!orderId) return [];

  const pays = []
    .concat(Array.isArray(p?.payments) ? p.payments : [])
    .concat(Array.isArray(p?.orderPayments) ? p.orderPayments : [])
    .concat(Array.isArray(p?.order?.payments) ? p.order.payments : []);

  const deduped = new Map<string, any>();

  pays.forEach((pay: any, idx: number) => {
    const paymentId = String(
      pay?.orderPaymentId ?? pay?.paymentId ?? pay?.id ?? pay?.paidId ?? `noid-${idx}`
    );
    deduped.set(`${orderId}::${paymentId}`, {
      order_id: orderId,
      payment_id: paymentId,
      payment_method: pay?.paymentType?.name ?? pay?.method ?? pay?.type ?? pay?.gateway ?? null,
      amount:
        typeof pay?.amount === 'number'
          ? pay.amount
          : typeof pay?.total === 'number'
            ? pay.total
            : null,
      created_at: toISOFromAR(pay?.createdAt ?? pay?.timestamp) ?? new Date().toISOString(),
    });
  });

  return Array.from(deduped.values());
}

async function syncRdbTables(supabase: any, payload: any) {
  const pedidoRow = buildRdbPedidoRow(payload);
  if (!pedidoRow?.order_id) return { skipped: true, reason: 'missing order_id' };

  const productoRows = buildRdbProductoRows(payload);
  const pagoRows = buildRdbPagoRows(payload);

  const { error: pedidoError } = await supabase
    .from('waitry_pedidos')
    .upsert(pedidoRow, { onConflict: 'order_id' });

  if (pedidoError) throw pedidoError;

  const orderId = pedidoRow.order_id;

  const { error: deleteProductosError } = await supabase
    .from('waitry_productos')
    .delete()
    .eq('order_id', orderId);

  if (deleteProductosError) throw deleteProductosError;

  if (productoRows.length) {
    const { error: productosError } = await supabase.from('waitry_productos').insert(productoRows);

    if (productosError) throw productosError;
  }

  const { error: deletePagosError } = await supabase
    .from('waitry_pagos')
    .delete()
    .eq('order_id', orderId);

  if (deletePagosError) throw deletePagosError;

  if (pagoRows.length) {
    const { error: pagosError } = await supabase.from('waitry_pagos').insert(pagoRows);

    if (pagosError) throw pagosError;
  }

  const { error: inboundUpdateError } = await supabase
    .from('waitry_inbound')
    .update({ processed: true, error: null })
    .eq('order_id', orderId);

  if (inboundUpdateError) throw inboundUpdateError;

  return {
    ok: true,
    order_id: orderId,
    productos: productoRows.length,
    pagos: pagoRows.length,
  };
}

async function codaUpsertRows(
  apiKey: string,
  tableId: string,
  keyColumns: string[],
  rows: Array<{ cells: Array<{ column: string; value: unknown }> }>
) {
  if (!rows.length) return { skipped: true, rows: 0 };
  const url = `${CODA_API_BASE}/docs/${CODA_DOC_ID}/tables/${encodeURIComponent(tableId)}/rows`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ keyColumns, rows }),
  });
  const text = await resp.text().catch(() => '');
  if (!resp.ok) throw new Error(`Coda upsert failed ${resp.status}: ${text}`);
  return text ? JSON.parse(text) : { ok: true };
}

async function pushToCodaMirror(payload: any) {
  const apiKey = Deno.env.get('CODA_API_KEY');
  if (!apiKey) {
    console.warn('[CODA] skipped: missing CODA_API_KEY');
    return { skipped: true, reason: 'missing CODA_API_KEY' };
  }

  const pedidoRow = mapPedidoRow(payload);
  const productoRows = mapProductoRows(payload);
  const pagoRows = mapPagoRows(payload);

  const result = {
    pedidos: { skipped: true } as any,
    productos: { skipped: true } as any,
    pagos: { skipped: true } as any,
  };

  result.pedidos = pedidoRow
    ? await codaUpsertRows(apiKey, CODA_TABLES.pedidos, [PEDIDOS_COLS.IDPEDIDO], [pedidoRow])
    : { skipped: true, reason: 'no pedido row' };

  result.productos = await codaUpsertRows(
    apiKey,
    CODA_TABLES.productos,
    [PRODUCTOS_COLS.PK],
    productoRows
  );
  result.pagos = await codaUpsertRows(apiKey, CODA_TABLES.pagos, [PAGOS_COLS.PK], pagoRows);

  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    let payload: Json;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const inner = unwrapPayload(payload?.payload ?? payload);
    const orderId = String(inner?.orderId ?? inner?.order?.id ?? inner?.id ?? 'unknown');
    const event = inner?.event ?? inner?.status ?? 'unknown';

    const encoder = new TextEncoder();
    const data = encoder.encode(rawBody);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const payloadHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      db: { schema: 'rdb' },
    });

    const { error } = await supabase.from('waitry_inbound').upsert(
      {
        order_id: orderId,
        event,
        payload_json: payload,
        payload_hash: payloadHash,
        received_at: new Date().toISOString(),
        processed: false,
        attempts: 0,
        error: null,
      },
      { onConflict: 'order_id' }
    );

    if (error) {
      console.error('Insert error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let rdbSync: any = { skipped: true };
    try {
      rdbSync = await syncRdbTables(supabase, inner);
    } catch (err) {
      console.error('[RDB] sync failed:', err);
      await supabase
        .from('waitry_inbound')
        .update({ processed: false, error: String((err as Error)?.message ?? err) })
        .eq('order_id', orderId);
      return new Response(
        JSON.stringify({ error: String((err as Error)?.message ?? err), order_id: orderId }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let codaMirrorV1: any = { skipped: true };
    try {
      codaMirrorV1 = await pushToCodaMirror(inner);
    } catch (err) {
      console.error('[CODA-V1] push failed:', err);
      codaMirrorV1 = { ok: false, error: String((err as Error)?.message ?? err) };
    }

    return new Response(
      JSON.stringify({
        ok: true,
        order_id: orderId,
        rdb_sync: rdbSync,
        coda_mirror_v1: codaMirrorV1,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
