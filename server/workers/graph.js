const { runPipeline } = require("../githubPipeline");
process.once("disconnect", () => process.exit(0));
process.once("message", async (request) => {
  let response;
  try {
    response = { result: await runPipeline(request.githubUrl) };
  } catch (error) {
    response = { error: {
      status: error.status || 502, code: error.code || "ANALYSIS_FAILED",
      message: error.status ? error.message : "Repository analysis could not complete",
    } };
  }
  if (process.connected) process.send(response, () => { if (process.connected) process.disconnect(); });
});
