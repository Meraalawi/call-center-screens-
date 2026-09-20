// Shared formatting helpers, ported from the prototype.
(function (global) {
  function fmt(cents) {
    const v = Math.max(0, cents) / 100;
    return '₪' + (Number.isInteger(v) ? v : v.toFixed(2));
  }

  function relTime(isoOrMs, lang) {
    const ts = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
    const d = Math.max(0, Math.round((Date.now() - ts) / 60000));
    const ar = lang === 'ar';
    if (d < 1) return ar ? 'الآن' : 'just now';
    if (d === 1) return ar ? 'قبل دقيقة' : '1 min ago';
    if (d < 60) return ar ? `قبل ${d} د` : `${d} min ago`;
    return ar ? `قبل ${Math.round(d / 60)} س` : `${Math.round(d / 60)} hr ago`;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  global.FMT = { fmt, relTime, escapeHtml };
})(window);
