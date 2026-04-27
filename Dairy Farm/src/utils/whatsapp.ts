export function sendWhatsAppMessage(phone: string, message: string) {
  const encodedMessage = encodeURIComponent(message);
  const url = `https://wa.me/${phone}?text=${encodedMessage}`;
  window.open(url, "_blank");
}
