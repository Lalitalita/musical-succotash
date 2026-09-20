# Routes plus-addressed deliveries (alice+Gmail@local) into a folder named
# after the "detail" part (Gmail) - this is how fetchmail's per-account
# deliveries (see ../fetchmail/deliver-lmtp.py) land in their own folder
# instead of all piling into INBOX.
require ["fileinto", "envelope", "subaddress", "variables"];

if envelope :detail :matches "to" "*" {
  fileinto "${1}";
  stop;
}
