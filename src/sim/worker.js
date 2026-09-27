import { runHeadless } from './battle.js';

self.onmessage = (ev) => {
  const { f, s, seed } = ev.data;
  const r = runHeadless(f, s, seed);
  self.postMessage({ winner: r.winner, exchange: r.exchange, remain: r.remain, t: r.t });
};
