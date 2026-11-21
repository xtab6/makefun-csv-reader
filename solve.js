// Faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// run(input) returns exactly csv-reader 1.0.0's answer {columns, rows, errors}
// for one case's input {text, header}. Same broken-row policy, same errors,
// same order — only faster: the reference reads one character at a time and
// builds every field up a character at a time; this reader jumps with
// indexOf, slices fields out whole, splits a clean line in one call, and only
// falls back to a character loop for the rare field that actually holds a
// stray CR, a doubled quote, or a line break inside quotes. One flat function
// with plain locals, so nothing is a closure over shared state.
//
// Policy (csv-reader 1.0.0, kept byte for byte):
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it is one quote, and each CRLF or lone CR inside it
//     is read as LF; what follows its closing quote, up to the next comma or
//     line break, is appended to it as it stands (quote_junk, when the field
//     ends); a quote that never closes is a literal character and the text
//     after it is read again as an unquoted field (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record starts
//     on (every LF, CRLF and lone CR inside a quoted field counted), row its
//     record's index in rows (null for the header), in the order met, a
//     field's quote_junk when the field ends and a record's short_row or
//     long_row when the record ends.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** Anything that makes a quoted field need work: a doubled quote, a CR, an LF. */
const QUOTED_SPECIAL = /["\r\n]/;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  const n = text.length;
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The index of the next LF at or after pos, or n when there is none: the
  // end of the line the current field is on. Recomputed at each record start
  // and whenever a quoted field that spanned lines moved pos past it.
  let lineEnd = n;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    lineEnd = text.indexOf('\n', pos);
    if (lineEnd === -1) lineEnd = n;

    let fields;
    // Whether the record's last field opened with a quote (false on the
    // clean-line path, which never reads a quoted field).
    let lastQuoted = false;
    // Fast path: a line holding no quote and no stray CR splits whole. The
    // CR of a CRLF line ending is not field content, so it is cut first.
    let segEnd = lineEnd;
    if (lineEnd < n && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13) segEnd = lineEnd - 1;
    const seg = text.slice(pos, segEnd);
    if (seg.indexOf('"') === -1 && seg.indexOf('\r') === -1) {
      fields = seg.split(',');
      if (lineEnd >= n) {
        pos = n;
      } else {
        pos = lineEnd + 1;
        line++;
      }
    } else {
      fields = [];
      let ended;
      do {
        // One field. Whether it opened with a quote decides, for a record
        // left holding a single empty field, whether it is a record at all.
        lastQuoted = text.charCodeAt(pos) === 34;
        // One field. A quoted field that closes on a comma, a line break or
        // the end of the text settles here; anything else leaves `prefix`
        // set and the unquoted scan below finishes the field onto it: the
        // text after a closing quote (junk), or the text after a quote that
        // never closes (the quote itself, as a literal character).
        let value;
        let prefix = null;
        let isJunk = false;
        if (text.charCodeAt(pos) === 34) {
          const open = pos;
          const openLine = line;
          pos += 1;
          // The closing quote is the next quote that is not doubled.
          let q = text.indexOf('"', pos);
          while (q !== -1 && text.charCodeAt(q + 1) === 34) q = text.indexOf('"', q + 2);
          if (q === -1) {
            // The quote never closes: it is a literal character, and the
            // text after it is read again as an unquoted field.
            pos = open + 1;
            line = openLine;
            errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
            prefix = '"';
          } else {
            const raw = text.slice(pos, q);
            let v;
            if (!QUOTED_SPECIAL.test(raw)) {
              v = raw;
            } else if (raw.indexOf('\r') === -1 && raw.indexOf('\n') === -1) {
              v = raw.replace(/""/g, '"');
            } else {
              // A quoted field holding a line break or a doubled quote:
              // build it up once, counting every LF, CRLF and lone CR
              // inside it as one line.
              let w = '';
              for (let i = 0; i < raw.length; i++) {
                const ch = raw[i];
                if (ch === '"') {
                  w += '"';
                  i++;
                  continue;
                }
                if (ch === '\r') {
                  w += '\n';
                  line++;
                  if (raw[i + 1] === '\n') i++;
                  continue;
                }
                if (ch === '\n') line++;
                w += ch;
              }
              v = w;
            }
            pos = q + 1;
            if (pos >= n) {
              value = v;
              ended = END;
            } else {
              const c = text.charCodeAt(pos);
              if (c === 44) {
                pos += 1;
                value = v;
                ended = COMMA;
              } else if (c === 10) {
                pos += 1;
                line += 1;
                value = v;
                ended = LINE_BREAK;
              } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
                pos += 2;
                line += 1;
                value = v;
                ended = LINE_BREAK;
              } else {
                // What follows the closing quote is appended as it stands,
                // up to the next comma or line break.
                prefix = v;
                isJunk = true;
              }
            }
          }
        }
        if (prefix !== null || value === undefined) {
          // Unquoted characters onto `prefix` up to the next comma or line
          // break: a CR not followed by LF is dropped (stray_cr). Any CR
          // inside the field is stray, except a trailing one that is the
          // CRLF terminator of a line break: the first LF at or after pos
          // is lineEnd, so no CR before it can be followed by an LF.
          if (pos > lineEnd) {
            lineEnd = text.indexOf('\n', pos);
            if (lineEnd === -1) lineEnd = n;
          }
          const comma = text.indexOf(',', pos);
          let end;
          if (comma !== -1 && comma < lineEnd) {
            end = comma;
            ended = COMMA;
          } else {
            end = lineEnd;
            ended = lineEnd >= n ? END : LINE_BREAK;
          }
          const raw = text.slice(pos, end);
          const pre = prefix === null ? '' : prefix;
          let added;
          if (raw.indexOf('\r') === -1) {
            value = pre ? pre + raw : raw;
            added = raw.length;
          } else {
            let w = pre;
            added = 0;
            for (let i = 0; i < raw.length; i++) {
              if (raw.charCodeAt(i) === 13) {
                if (i !== raw.length - 1 || ended !== LINE_BREAK) {
                  errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
                }
                continue;
              }
              w += raw[i];
              added++;
            }
            value = w;
          }
          if (ended === COMMA) {
            pos = end + 1;
          } else if (ended === LINE_BREAK) {
            pos = end + 1;
            line++;
          } else {
            pos = n;
          }
          if (isJunk && added > 0) {
            errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
          }
        }
        fields.push(value);
      } while (ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay). A single empty field read as quoted ("")
    // is a record; the clean-line path never reads a quoted field, so its
    // lastQuoted stays false.
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
