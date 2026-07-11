export function getRoomUrl(roomName: string) {
  const encodedRoomName = encodeURIComponent(roomName);

  if (typeof window === "undefined") {
    return `/room/${encodedRoomName}`;
  }

  return `${window.location.origin}/room/${encodedRoomName}`;
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}
