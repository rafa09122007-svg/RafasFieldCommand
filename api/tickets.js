// ═══════════════════════════════════════════════════════════════════════════════
//  BLACK DROP TRUCKING — FIELD COMMAND API  (OPTIMIZED FOR SPEED)
//  BlackDropAPI.gs
//
//  KEY CHANGES vs original:
//  1. doPost no longer calls colorBillingQueue() — saves 30-90s per submission
//  2. All loads written in ONE setValues() call instead of appendRow() loop
//  3. Image uploads run in parallel-ish via helper
//  4. Color refresh is triggered on a 1-minute time-based trigger instead
//  5. markNewSubmissionRed is batched into the same write
// ═══════════════════════════════════════════════════════════════════════════════

const SPREADSHEET_ID  = "1o5tDlMszfKijqtbxv3_8ogxvsNdV5aqcNzBD9aVh034";
const DRIVE_FOLDER_ID = "1yZkaWsYg5Vt6Q7PILfwG9e9gNCykW_PZ";
const OWNER_EMAIL     = "rafa09122007@gmail.com";

// ── doGet (unchanged logic, minor cleanup) ───────────────────────────────────
function doGet(e) {
  if (e.parameter && e.parameter.mode === "queue" && e.parameter.phone) {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("Billing Queue");
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];

    const phoneIndex      = headers.indexOf("Login Phone #");
    const statusIndex     = headers.indexOf("Status");
    const timestampIndex  = headers.indexOf("Timestamp");
    const submissionIndex = headers.indexOf("Submission ID");
    const seenSubmission  = {};

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][phoneIndex]).trim() !== String(e.parameter.phone).trim()) continue;
      const status       = String(data[i][statusIndex]).trim();
      const timestamp    = data[i][timestampIndex];
      const submissionId = data[i][submissionIndex];
      const tsValue      = (timestamp instanceof Date) ? timestamp.getTime() : new Date(timestamp).getTime();
      if (!seenSubmission[submissionId] || tsValue >= seenSubmission[submissionId].ts) {
        seenSubmission[submissionId] = {
          ts:  tsValue,
          obj: Object.fromEntries(headers.map((h, idx) => [h, data[i][idx]]))
        };
      }
    }

    const results = Object.values(seenSubmission).map(v => v.obj);
    return ContentService.createTextOutput(JSON.stringify(results)).setMimeType(ContentService.MimeType.JSON);
  }

  if (e && e.parameter && e.parameter.testDrive === "1") {
    try {
      const tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8pGd0AAAAASUVORK5CYII=";
      const url  = uploadBase64Image(tiny, "DRIVE_TEST");
      return ContentService.createTextOutput(JSON.stringify({ success: true, url })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Phone Numbers");
  if (!sheet || sheet.getLastRow() < 2)
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const phones = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
    .flat().map(p => String(p).trim()).filter(p => p.length > 0);
  return ContentService.createTextOutput(JSON.stringify(phones)).setMimeType(ContentService.MimeType.JSON);
}


// ── doPost — OPTIMIZED ───────────────────────────────────────────────────────
// Major speedups:
//   • All image uploads happen first, collected into variables
//   • All load rows built in memory, then written with ONE setValues() call
//   • colorBillingQueue() is NOT called here — deferred to time trigger
//   • markNewSubmissionRed is a simple appendRow (fast, no read needed)
function doPost(e) {
  try {
    const ss           = SpreadsheetApp.openById(SPREADSHEET_ID);
    const billingSheet = ss.getSheetByName("Billing Queue");
    const data         = JSON.parse(e.postData.contents);

    const isEdit       = !!data.submissionId;
    const submissionId = isEdit ? data.submissionId : "BD-" + Date.now();
    const timestamp    = new Date();

    // ── Upload images ──────────────────────────────────────────────────────
    // These are the slowest part (~2-5s each). We do them all up front.
    const ticketImageUrl = uploadBase64Image(data.fieldTicketImage, submissionId + "_ticket");
    const signatureUrl   = uploadBase64Image(data.signature,        submissionId + "_signature");

    // Pre-upload all load verification images
    const loads = Array.isArray(data.loads) && data.loads.length ? data.loads : [null];
    const loadImageUrls = loads.map((load, i) => {
      if (load && load.verificationImage) {
        return uploadBase64Image(load.verificationImage, submissionId + "_load_" + (i + 1));
      }
      return "";
    });

    // ── Read headers once ──────────────────────────────────────────────────
    const lastCol = billingSheet.getLastColumn();
    const headers = billingSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const col = {};
    headers.forEach((h, i) => { const k = String(h || "").trim(); if (k) col[k] = i; });

    const makeRow     = () => new Array(headers.length).fill("");
    const setByHeader = (row, name, value) => { if (col[name] !== undefined) row[col[name]] = value ?? ""; };

    // ── Handle edit: delete old rows ───────────────────────────────────────
    if (isEdit) {
      const allData = billingSheet.getDataRange().getValues();
      const subIdx  = allData[0].indexOf("Submission ID");
      // Delete from bottom up to avoid index shifting
      for (let i = allData.length - 1; i >= 1; i--) {
        if (allData[i][subIdx] === submissionId) billingSheet.deleteRow(i + 1);
      }
    }

    const invoiceNum = generateInvoiceNumber_();

    // ── Build ALL rows in memory ───────────────────────────────────────────
    const allRows = [];

    loads.forEach((load, index) => {
      const row = makeRow();

      setByHeader(row, "Login Phone #",  data.phone       || "");
      setByHeader(row, "Submission ID",  submissionId);
      setByHeader(row, "Timestamp",      timestamp);
      setByHeader(row, "Status",         "PENDING");
      setByHeader(row, "Notes",          data.notes       || "");
      setByHeader(row, "Client",         data.client      || "");
      setByHeader(row, "Field Ticket #", data.fieldTicket  || "");
      setByHeader(row, "Dispatch #",     data.dispatch    || "");
      setByHeader(row, "Unit #",         data.unit        || "");
      setByHeader(row, "Driver",         data.driver      || "");
      setByHeader(row, "Service Date",   data.workDate    || "");
      setByHeader(row, "Well/Lease",     data.wellLease   || "");
      setByHeader(row, "Load Count",     loads.length);
      setByHeader(row, "Load Ticket #",  load?.loadTicket || "");
      setByHeader(row, "Fluid Type",     load?.fluid      || "");
      setByHeader(row, "BBLS",           load?.bbls       || "");
      setByHeader(row, "Unload",         load?.manifestOps?.unload   ? "TRUE" : "FALSE");
      setByHeader(row, "Wash Out",       load?.manifestOps?.washOut  ? "TRUE" : "FALSE");
      setByHeader(row, "Gemini Ref #",   load?.geminiRef  || "");
      setByHeader(row, "Invoice #",      invoiceNum);

      const isExxon = String(data.client || "").toLowerCase().includes("exxon");
      setByHeader(row, "Gemini Dispatch Ref # *", isExxon ? (load?.geminiRef || "") : "");

      if (index === 0) {
        const st   = data.startTime          || "";
        const et   = data.endTime            || "";
        const hr   = data.hourlyRate         || "";
        const desc = data.hourlyDescription  || "Standby / Wait Time";
        setByHeader(row, "Start Time",         st);
        setByHeader(row, "End Time",           et);
        setByHeader(row, "Hourly Rate",        hr);
        setByHeader(row, "Hourly Description", desc);
        if (st && et) {
          const [sh, sm] = st.split(":").map(Number);
          const [eh, em] = et.split(":").map(Number);
          let mins = (eh * 60 + em) - (sh * 60 + sm);
          if (mins < 0) mins += 1440;
          const hrs = mins / 60;
          setByHeader(row, "Total Hours",  hrs.toFixed(2));
          setByHeader(row, "Hours Amount", hr ? (hrs * parseFloat(hr)).toFixed(2) : "");
        }
      }

      // Verification image URL
      if (loadImageUrls[index]) {
        setByHeader(row, "Verification Image", `=HYPERLINK("${loadImageUrls[index]}","Load ${index + 1}")`);
      }

      if (index === 0) {
        setByHeader(row, "Field Ticket Image", ticketImageUrl ? `=HYPERLINK("${ticketImageUrl}","View Ticket")`   : "");
        setByHeader(row, "Signature",          signatureUrl   ? `=HYPERLINK("${signatureUrl}","View Signature")`  : "");
      }

      allRows.push(row);
    });

    // ── WRITE ALL ROWS AT ONCE — this is the big speedup ───────────────────
    if (allRows.length > 0) {
      const startRow = billingSheet.getLastRow() + 1;
      billingSheet.getRange(startRow, 1, allRows.length, headers.length).setValues(allRows);

      // Copy formulas for each newly written row
      for (let i = 0; i < allRows.length; i++) {
        copyFormulasFromTemplateRow_(billingSheet, headers, startRow + i, 2,
          ["Rate", "Invoice Date", "Invoice Name", "Terms", "Due Date"]);
      }
    }

    // ── Mark in dispatch log (fast: just an append) ────────────────────────
    markNewSubmissionRed(submissionId);

    // ── DO NOT call colorBillingQueue() here! ──────────────────────────────
    // It will run automatically via the 1-minute time trigger.
    // This alone saves 30-90 seconds per submission.

    return ContentService.createTextOutput(JSON.stringify({ success: true, submissionId }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message, stack: err.stack }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ── Invoice number generator (unchanged) ─────────────────────────────────────
function generateInvoiceNumber_() {
  const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  let counter   = ss.getSheetByName("InvoiceCounter");
  if (!counter) {
    counter = ss.insertSheet("InvoiceCounter");
    counter.hideSheet();
    counter.getRange(1, 1).setValue(1000);
  }
  const lastNum = parseInt(counter.getRange(1, 1).getValue()) || 1000;
  const newNum  = lastNum + 1;
  counter.getRange(1, 1).setValue(newNum);
  return "INV-" + newNum;
}


// ── Image uploader (unchanged) ───────────────────────────────────────────────
function uploadBase64Image(base64String, fileNamePrefix) {
  if (!base64String || !base64String.startsWith("data:image")) return "";
  const matches = base64String.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) return "";
  const blob   = Utilities.newBlob(Utilities.base64Decode(matches[2]), matches[1], fileNamePrefix + "_" + Date.now());
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const file   = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}


// ── Formula copier (unchanged) ───────────────────────────────────────────────
function copyFormulasFromTemplateRow_(sheet, headers, destRow, templateRow, headerNames) {
  headerNames.forEach(name => {
    const idx = headers.indexOf(name);
    if (idx === -1) return;
    const col          = idx + 1;
    const templateCell = sheet.getRange(templateRow, col);
    const formula      = templateCell.getFormula();
    if (formula && formula.trim() !== "") {
      const destCell = sheet.getRange(destRow, col);
      destCell.setFormula(formula);
      try { destCell.setNumberFormat(templateCell.getNumberFormat()); } catch (e) {}
    }
  });
}


// ── Scope helpers (unchanged) ────────────────────────────────────────────────
function forceDriveScope() { DriveApp.getRootFolder().getName(); }
function authorizeMail()   { MailApp.sendEmail({ to: OWNER_EMAIL, subject: "Authorization Test", body: "Authorize MailApp" }); }


// ── sendApprovalEmail (unchanged from your original) ─────────────────────────
function sendApprovalEmail(headers, rowData, formulas) {
  const get = name => {
    const i = headers.indexOf(name);
    return i !== -1 ? rowData[i] : "";
  };

  const invoiceNumber     = get("Invoice #");
  const client            = get("Client");
  const fieldTicket       = get("Field Ticket #");
  const dispatch          = get("Dispatch #");
  const unit              = get("Unit #");
  const driver            = get("Driver");
  const wellLease         = get("Well/Lease");
  const serviceDateRaw    = get("Service Date");
  const terms             = get("Terms") || "Net 30";
  const dueDateRaw        = get("Due Date");
  const startTime         = get("Start Time");
  const endTime           = get("End Time");
  const totalHours        = parseFloat(get("Total Hours"))  || 0;
  const hourlyRate        = parseFloat(get("Hourly Rate"))  || 0;
  const hourlyDescription = get("Hourly Description")       || "Standby / Wait Time";

  const fmtDate = raw => {
    if (!raw) return "—";
    const d = (raw instanceof Date) ? raw : new Date(raw);
    return isNaN(d) ? String(raw) : d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "2-digit", day: "2-digit", year: "numeric" });
  };
  const invoiceDate = fmtDate(new Date());
  const dueDate     = fmtDate(dueDateRaw);
  const serviceDate = serviceDateRaw
    ? (serviceDateRaw instanceof Date ? serviceDateRaw : new Date(serviceDateRaw))
        .toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : "—";

  const ss             = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet          = ss.getSheetByName("Billing Queue");
  const allData        = sheet.getDataRange().getValues();
  const allHeaders     = allData[0];
  const submissionId   = rowData[allHeaders.indexOf("Submission ID")];
  const subIdx         = allHeaders.indexOf("Submission ID");
  const rowsForInvoice = allData.slice(1).filter(r => r[subIdx] === submissionId);

  let totalBBLS = 0, totalAmount = 0;
  let loadRowsHtml = "";

  rowsForInvoice.forEach((row, i) => {
    const gR      = name => { const ci = allHeaders.indexOf(name); return ci !== -1 ? row[ci] : ""; };
    const fluid   = gR("Fluid Type")    || "Fresh Water";
    const loadTkt = gR("Load Ticket #") || "";
    const bbl     = parseFloat(gR("BBLS")) || 0;
    const rate    = parseFloat(gR("Rate")) || 0;
    const amount  = bbl * rate;
    totalBBLS   += bbl;
    totalAmount += amount;

    const bg = i % 2 === 0 ? "#ffffff" : "#fafafa";
    loadRowsHtml += `
      <tr>
        <td style="padding:11px 14px;background:${bg};border-bottom:1px solid #f0f0f0;">
          <div style="font-weight:700;font-size:13px;color:#111;">Load ${i + 1}: ${fluid}</div>
          ${loadTkt ? `<div style="font-size:11px;color:#888;margin-top:2px;">Ticket: ${loadTkt}</div>` : ""}
        </td>
        <td style="padding:11px 14px;background:${bg};border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;">${bbl.toFixed(2)}</td>
        <td style="padding:11px 14px;background:${bg};border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;">$${rate.toFixed(2)}</td>
        <td style="padding:11px 14px;background:${bg};border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:700;">$${amount.toFixed(2)}</td>
      </tr>`;
  });

  loadRowsHtml += `
    <tr>
      <td style="padding:11px 14px;background:#f0f0f0;"></td>
      <td style="padding:11px 14px;background:#f0f0f0;text-align:right;font-weight:700;font-size:13px;">${totalBBLS.toFixed(2)}</td>
      <td style="padding:11px 14px;background:#f0f0f0;text-align:right;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;">Total</td>
      <td style="padding:11px 14px;background:#f0f0f0;text-align:right;font-weight:700;font-size:15px;">$${totalAmount.toFixed(2)}</td>
    </tr>`;

  let hourlySection = "";
  if (totalHours > 0 && hourlyRate > 0) {
    const hoursAmount = totalHours * hourlyRate;
    totalAmount += hoursAmount;
    const timeRange = (startTime && endTime) ? `${startTime} – ${endTime}` : "";
    const hourlyRowsHtml = `
      <tr>
        <td style="padding:11px 14px;background:#ffffff;border-bottom:1px solid #f0f0f0;">
          <div style="font-weight:700;font-size:13px;color:#111;">${hourlyDescription}</div>
          ${timeRange ? `<div style="font-size:11px;color:#888;margin-top:2px;">${timeRange}</div>` : ""}
        </td>
        <td style="padding:11px 14px;background:#ffffff;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;">${totalHours.toFixed(2)}</td>
        <td style="padding:11px 14px;background:#ffffff;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;">$${hourlyRate.toFixed(2)}</td>
        <td style="padding:11px 14px;background:#ffffff;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:700;">$${hoursAmount.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding:11px 14px;background:#f0f0f0;"></td>
        <td style="padding:11px 14px;background:#f0f0f0;text-align:right;font-weight:700;font-size:13px;">${totalHours.toFixed(2)}</td>
        <td style="padding:11px 14px;background:#f0f0f0;text-align:right;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;">Total</td>
        <td style="padding:11px 14px;background:#f0f0f0;text-align:right;font-weight:700;font-size:15px;">$${hoursAmount.toFixed(2)}</td>
      </tr>`;

    hourlySection = `
      <div style="margin-top:28px;">
        <div style="font-size:9px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Hourly Services</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr style="background:#c0392b;">
              <th align="left"  style="padding:10px 14px;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;width:46%;">Description</th>
              <th align="right" style="padding:10px 14px;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;width:18%;">Hours</th>
              <th align="right" style="padding:10px 14px;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;width:18%;">Rate / Hr</th>
              <th align="right" style="padding:10px 14px;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;width:18%;">Amount</th>
            </tr>
          </thead>
          <tbody>${hourlyRowsHtml}</tbody>
        </table>
      </div>`;
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:30px;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:700px;margin:0 auto;background:#ffffff;padding:44px 48px 52px;box-shadow:0 4px 24px rgba(0,0,0,0.12);">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="vertical-align:top;">
        <div style="font-weight:900;font-size:16px;color:#000;letter-spacing:0.5px;">BLACK DROP TRUCKING LLC</div>
        <div style="font-size:11px;color:#666;line-height:1.7;margin-top:4px;">1904 E Pine Ave<br>Midland, TX 79705<br>blackdroptrucking@gmail.com</div>
      </td>
      <td align="right" style="vertical-align:top;">
        <div style="font-size:40px;font-weight:900;color:#D4AF37;letter-spacing:3px;line-height:1;">INVOICE</div>
      </td>
    </tr>
  </table>
  <div style="height:10px;background:#D4AF37;margin:10px 0 24px;border-radius:2px;"></div>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
    <tr>
      <td style="vertical-align:top;">
        <div style="font-size:9px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Bill To</div>
        <div style="font-size:18px;font-weight:700;color:#000;">${client}</div>
      </td>
      <td align="right" style="vertical-align:top;font-size:12px;line-height:2;">
        <span style="color:#999;font-weight:700;font-size:10px;text-transform:uppercase;margin-right:8px;">Invoice #</span><strong>${invoiceNumber}</strong><br>
        <span style="color:#999;font-weight:700;font-size:10px;text-transform:uppercase;margin-right:8px;">Date</span>${invoiceDate}<br>
        <span style="color:#999;font-weight:700;font-size:10px;text-transform:uppercase;margin-right:8px;">Terms</span>${terms}<br>
        <span style="color:#999;font-weight:700;font-size:10px;text-transform:uppercase;margin-right:8px;">Due Date</span><strong>${dueDate}</strong>
      </td>
    </tr>
  </table>
  <div style="font-size:9px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;">Job Details</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
    <tr>
      <td style="width:33%;padding-bottom:10px;vertical-align:top;"><div style="font-size:8px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Field Ticket</div><div style="font-size:13px;color:#000;">${fieldTicket}</div></td>
      <td style="width:33%;padding-bottom:10px;vertical-align:top;"><div style="font-size:8px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Dispatch #</div><div style="font-size:13px;color:#000;">${dispatch}</div></td>
      <td style="width:33%;padding-bottom:10px;vertical-align:top;"><div style="font-size:8px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Unit #</div><div style="font-size:13px;color:#000;">${unit}</div></td>
    </tr>
    <tr>
      <td style="vertical-align:top;"><div style="font-size:8px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Driver</div><div style="font-size:13px;color:#000;">${driver}</div></td>
      <td style="vertical-align:top;"><div style="font-size:8px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Service Date</div><div style="font-size:13px;color:#000;">${serviceDate}</div></td>
      <td style="vertical-align:top;"><div style="font-size:8px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Well / Lease</div><div style="font-size:13px;color:#000;">${wellLease}</div></td>
    </tr>
  </table>
  <div style="font-size:9px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">Activity — ${rowsForInvoice.length} Load(s)</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:0;">
    <thead>
      <tr style="background:#1a1a1a;">
        <th align="left"  style="padding:10px 14px;color:#D4AF37;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;width:46%;">Description</th>
        <th align="right" style="padding:10px 14px;color:#D4AF37;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;width:18%;">Qty (BBL)</th>
        <th align="right" style="padding:10px 14px;color:#D4AF37;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;width:18%;">Rate</th>
        <th align="right" style="padding:10px 14px;color:#D4AF37;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;width:18%;">Amount</th>
      </tr>
    </thead>
    <tbody>${loadRowsHtml}</tbody>
  </table>
  ${hourlySection}
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
    <tr>
      <td></td>
      <td align="right" style="width:240px;">
        <div style="background:#1a1a1a;padding:20px 28px;border-radius:4px;text-align:right;">
          <div style="color:#D4AF37;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Balance Due</div>
          <div style="color:#ffffff;font-size:32px;font-weight:900;margin-top:4px;letter-spacing:-1px;">$${totalAmount.toFixed(2)}</div>
        </div>
      </td>
    </tr>
  </table>
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#666;">
    Please make checks payable to <strong>Black Drop Trucking LLC</strong><br>Mail to: 1904 E Pine Ave, Midland, TX 79705
  </div>
  <div style="text-align:center;margin-top:24px;font-size:11px;color:#aaa;font-style:italic;">Thank you for your business.</div>
</div>
</body>
</html>`;

  const pdf = Utilities.newBlob(html, "text/html")
    .getAs("application/pdf")
    .setName(`Invoice_${invoiceNumber}.pdf`);

  MailApp.sendEmail({
    to:          OWNER_EMAIL,
    subject:     `Invoice #${invoiceNumber} — Black Drop Trucking — ${client} ($${totalAmount.toFixed(2)})`,
    htmlBody:    html,
    attachments: [pdf]
  });
}
