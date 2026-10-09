import { authFetch, initAuth } from "./auth.js";

const uploadBtn = document.getElementById("uploadBtn");
const audioFileInput = document.getElementById("audioFile");
const dropzone = document.getElementById("dropzone");
const fileLabel = document.getElementById("fileLabel");
const fileError = document.getElementById("fileError");
const processingSection = document.getElementById("processingSection");
const progressBar = document.getElementById("progressBar");
const progressPercent = document.getElementById("progressPercent");
const progressStatus = document.getElementById("progressStatus");

const summaryContent = document.getElementById("summaryContent");
const decisionsList = document.getElementById("decisionsList");
const actionItemsList = document.getElementById("actionItemsList");
const transcriptContent = document.getElementById("transcriptContent");
const emptyState = document.getElementById("emptyState");
const sidebarEmpty = document.getElementById("sidebarEmpty");
const meetingList = document.getElementById("meetingList");
const resultsSection = document.getElementById("resultsSection");
const composerSection = document.getElementById("composerSection");
const newMeetingBtn = document.getElementById("newMeetingBtn");
const meetingTitle = document.getElementById("meetingTitle");

let selectedMeetingId = null;
let pollingMeetingId = null;

const MEETING_PATH = /^\/meetings\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const STAGE_LABELS = {
  QUEUED: "Queued...",
  DOWNLOADING_AUDIO: "Downloading audio...",
  TRANSCRIBING: "Transcribing audio...",
  ANALYZING: "Analyzing meeting with LLM...",
  COMPLETE: "Complete!",
};

audioFileInput?.addEventListener("change", () => {
  updateUploadState(audioFileInput.files?.[0]);
});

["dragover", "dragleave", "drop"].forEach((eventName) => {
  dropzone?.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.toggle("dragover", eventName === "dragover");
  });
});

dropzone?.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file || !audioFileInput) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  audioFileInput.files = transfer.files;
  updateUploadState(file);
});

uploadBtn?.addEventListener("click", async () => {
  const file = audioFileInput?.files?.[0];
  if (!file) {
    alert("Please select an audio file first.");
    return;
  }
  if (file.size > MAX_AUDIO_BYTES) {
    updateUploadState(file);
    return;
  }

  uploadBtn.disabled = true;
  processingSection?.classList.remove("hidden");
  setProgress(0, "Uploading audio...");

  let meetingId = null;
  try {
    // 1. Get presigned upload URL from Express API
    const urlRes = await authFetch("/api/meetings/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "audio/mpeg",
      }),
    });

    if (!urlRes.ok) {
      const errData = await urlRes.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to get upload URL (${urlRes.status})`);
    }
    const { uploadUrl, audioPath } = await urlRes.json();

    // 2. Upload file directly to Backblaze B2 via presigned PUT
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "audio/mpeg",
      },
      body: file,
    });

    if (!putRes.ok) {
      throw new Error(`Upload to storage failed with status ${putRes.status}`);
    }

    // 3. Enqueue the background processing job once upload completes
    const jobRes = await authFetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioPath }),
    });

    if (!jobRes.ok) {
      const errData = await jobRes.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to start analysis (${jobRes.status})`);
    }
    const created = await jobRes.json();
    const jobId = created.jobId;
    meetingId = created.meetingId;

    if (location.pathname === "/") {
      history.pushState({}, "", `/meetings/${meetingId}`);
      selectedMeetingId = meetingId;
      showMeetingView();
      setMeetingTitle(file.name);
      processingSection?.classList.remove("hidden");
      resultsSection?.classList.add("hidden");
    }

    await loadMeetings();
    await pollJob(jobId, meetingId);
    await loadMeetings();
  } catch (err) {
    console.error("[Upload Error]", err);
    const stillHere = meetingId ? currentMeetingId() === meetingId : !currentMeetingId();
    if (stillHere) {
      processingSection?.classList.remove("hidden");
      setProgress(0, `Error: ${err.message}`);
    }
    updateUploadState(audioFileInput?.files?.[0]);
  }
});

async function pollJob(jobId, meetingId) {
  pollingMeetingId = meetingId;
  try {
    while (true) {
      const res = await authFetch(`/api/meetings/jobs/${jobId}`);
      if (!res.ok) {
        throw new Error(`Failed to check job status (${res.status})`);
      }

      const { status, progress, result } = await res.json();
      const watching = currentMeetingId() === meetingId;

      if (watching && status !== "completed" && status !== "failed") {
        processingSection?.classList.remove("hidden");
        resultsSection?.classList.add("hidden");
        const percentage = Number(progress?.percentage ?? 0);
        const stage = progress?.stage;
        setProgress(percentage, STAGE_LABELS[stage] || "Queued...");
      }

      if (status === "completed") {
        if (watching) {
          processingSection?.classList.add("hidden");
          renderResult(result);
        }
        updateUploadState(audioFileInput?.files?.[0]);
        return;
      }

      if (status === "failed") {
        if (watching) {
          processingSection?.classList.add("hidden");
          renderResult({
            summary: "Processing failed for this recording.",
            transcript: "",
            decisions: [],
            actionItems: [],
          });
        }
        updateUploadState(audioFileInput?.files?.[0]);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    if (pollingMeetingId === meetingId) pollingMeetingId = null;
  }
}

function updateUploadState(file) {
  if (!fileLabel) return;
  if (!file) {
    fileLabel.textContent = "No file selected";
    fileLabel.classList.remove("has-file", "error");
    setFileError("");
    if (uploadBtn) uploadBtn.disabled = false;
    return;
  }

  const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
  fileLabel.textContent = `${file.name} · ${sizeMb} MB`;
  fileLabel.classList.add("has-file");

  if (file.size > MAX_AUDIO_BYTES) {
    fileLabel.classList.add("error");
    setFileError("This file is over the 25 MB limit.");
    if (uploadBtn) uploadBtn.disabled = true;
    return;
  }

  fileLabel.classList.remove("error");
  setFileError("");
  if (uploadBtn) uploadBtn.disabled = false;
}

function setFileError(text) {
  if (!fileError) return;
  fileError.textContent = text || "";
  fileError.hidden = !text;
}

function setProgress(percentage, text) {
  if (progressBar) progressBar.style.width = `${percentage}%`;
  if (progressPercent) progressPercent.textContent = `${percentage}%`;
  if (progressStatus) {
    progressStatus.textContent = text;
    progressStatus.classList.toggle("error", text.startsWith("Error") || text.startsWith("Processing failed"));
  }
}

const STATUS_LABELS = {
  queued: "Queued",
  complete: "Complete",
  failed: "Failed",
};

window.addEventListener("auth:ready", async () => {
  await loadMeetings();
  applyRoute();
});

newMeetingBtn?.addEventListener("click", () => {
  if (location.pathname !== "/") history.pushState({}, "", "/");
  showComposer();
});

window.addEventListener("popstate", () => {
  if (document.getElementById("appSection")?.classList.contains("hidden")) return;
  applyRoute();
});

function currentMeetingId() {
  return location.pathname.match(MEETING_PATH)?.[1] ?? null;
}

function applyRoute() {
  const meetingId = currentMeetingId();
  if (meetingId) {
    openMeeting(meetingId);
    return;
  }
  showComposer();
}

function showComposer() {
  selectedMeetingId = null;
  composerSection?.classList.remove("hidden");
  processingSection?.classList.add("hidden");
  resultsSection?.classList.add("hidden");
  meetingTitle?.classList.add("hidden");
  newMeetingBtn?.classList.add("selected");
  document.querySelectorAll(".meeting-row.selected").forEach((row) => {
    row.classList.remove("selected");
  });
}

function showMeetingView() {
  composerSection?.classList.add("hidden");
  newMeetingBtn?.classList.remove("selected");
}

function setMeetingTitle(text) {
  if (!meetingTitle) return;
  meetingTitle.textContent = text || "Meeting";
  meetingTitle.classList.remove("hidden");
}

function highlightMeeting(meetingId) {
  document.querySelectorAll(".meeting-row").forEach((row) => {
    row.classList.toggle("selected", row.dataset.id === meetingId);
  });
}

async function loadMeetings() {
  const res = await authFetch("/api/meetings");
  if (!res.ok) {
    if (sidebarEmpty) {
      sidebarEmpty.textContent = "Could not load meetings.";
      sidebarEmpty.classList.remove("hidden");
    }
    if (meetingList) meetingList.innerHTML = "";
    return;
  }

  const { meetings } = await res.json();
  if (!meetings?.length) {
    emptyState?.classList.remove("hidden");
    sidebarEmpty?.classList.remove("hidden");
    if (sidebarEmpty) sidebarEmpty.textContent = "No meetings yet";
    if (meetingList) meetingList.innerHTML = "";
    return;
  }

  emptyState?.classList.add("hidden");
  sidebarEmpty?.classList.add("hidden");
  if (!meetingList) return;

  meetingList.innerHTML = "";
  for (const meeting of meetings) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "meeting-row";
    if (meeting.id === selectedMeetingId) button.classList.add("selected");

    const text = document.createElement("span");
    const name = document.createElement("span");
    name.className = "meeting-name";
    name.textContent = fileNameFromPath(meeting.audioPath);
    const date = document.createElement("span");
    date.className = "meeting-date";
    date.textContent = formatWhen(meeting.createdAt);
    text.append(name, date);

    button.dataset.id = meeting.id;

    const status = document.createElement("span");
    status.className = `status-pill ${meeting.status}`;
    status.textContent = STATUS_LABELS[meeting.status] || meeting.status;

    button.append(text, status);
    button.addEventListener("click", () => goToMeeting(meeting.id));
    li.appendChild(button);
    meetingList.appendChild(li);
  }
}

function goToMeeting(meetingId) {
  if (meetingId === selectedMeetingId && currentMeetingId() === meetingId) return;
  if (currentMeetingId() !== meetingId) {
    history.pushState({}, "", `/meetings/${meetingId}`);
  }
  openMeeting(meetingId);
}

async function openMeeting(meetingId) {
  const alreadyOpen = meetingId === selectedMeetingId;
  showMeetingView();
  highlightMeeting(meetingId);
  const rowName = document.querySelector(`.meeting-row[data-id="${CSS.escape(meetingId)}"] .meeting-name`);
  setMeetingTitle(rowName?.textContent || "Meeting");
  if (alreadyOpen) return;

  selectedMeetingId = meetingId;
  const res = await authFetch(`/api/meetings/${meetingId}`);
  if (selectedMeetingId !== meetingId) return;
  if (!res.ok) {
    selectedMeetingId = null;
    highlightMeeting("");
    return;
  }
  const { meeting } = await res.json();
  if (selectedMeetingId !== meetingId) return;

  setMeetingTitle(fileNameFromPath(meeting.audioPath));
  if (pollingMeetingId === meetingId && meeting.status === "queued") {
    processingSection?.classList.remove("hidden");
    resultsSection?.classList.add("hidden");
    return;
  }
  processingSection?.classList.add("hidden");

  if (meeting.status !== "complete") {
    renderResult({
      summary: meeting.status === "failed"
        ? "Processing failed for this recording."
        : "This recording is still processing.",
      transcript: "",
      decisions: [],
      actionItems: [],
    });
    return;
  }

  renderResult({
    summary: meeting.summary,
    transcript: meeting.transcript,
    decisions: meeting.decisions,
    actionItems: meeting.actionItems,
  });
}

function fileNameFromPath(audioPath) {
  const name = String(audioPath || "").split("/").pop();
  return name || "Meeting";
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function renderResult(result) {
  if (!result) return;
  resultsSection?.classList.remove("hidden");

  if (summaryContent) {
    summaryContent.textContent = result.summary || "No summary provided.";
    summaryContent.classList.remove("muted");
  }

  if (transcriptContent) {
    transcriptContent.textContent = result.transcript || "No transcript available.";
    transcriptContent.classList.remove("muted");
  }

  if (decisionsList) {
    decisionsList.innerHTML = "";
    if (result.decisions && result.decisions.length > 0) {
      for (const decision of result.decisions) {
        const li = document.createElement("li");
        li.textContent = decision;
        decisionsList.appendChild(li);
      }
    } else {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No key decisions recorded.";
      decisionsList.appendChild(li);
    }
  }

  if (actionItemsList) {
    actionItemsList.innerHTML = "";
    if (result.actionItems && result.actionItems.length > 0) {
      for (const item of result.actionItems) {
        const li = document.createElement("li");
        li.className = "action-item";
        const task = document.createElement("span");
        task.textContent = item.task;
        li.appendChild(task);
        if (item.assignee) {
          const assignee = document.createElement("span");
          assignee.className = "assignee";
          assignee.textContent = item.assignee;
          li.appendChild(assignee);
        } else {
          const assignee = document.createElement("span");
          assignee.className = "assignee unassigned";
          assignee.textContent = "Unassigned";
          li.appendChild(assignee);
        }
        actionItemsList.appendChild(li);
      }
    } else {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No action items extracted.";
      actionItemsList.appendChild(li);
    }
  }
}

initAuth();
