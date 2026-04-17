function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Beta Feedback");

    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Beta Feedback");
      sheet.appendRow([
        "Created At",
        "Name",
        "Email",
        "Category",
        "Message",
        "Source",
      ]);
    }

    var payload = JSON.parse(e.postData.contents || "{}");

    sheet.appendRow([
      payload.createdAt || new Date().toISOString(),
      payload.name || "",
      payload.email || "",
      payload.category || "",
      payload.message || "",
      payload.source || "crewtools-beta",
    ]);

    return ContentService.createTextOutput(
      JSON.stringify({
        ok: true,
        message: "Feedback saved to Google Sheets.",
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        ok: false,
        message: error && error.message ? error.message : "Unknown error",
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
