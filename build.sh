#!/bin/bash
set -euo pipefail

# ivy-blackboard runs directly via Bun (no compiled binary).
# This script installs shell wrappers to ~/bin/.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOME}/bin"

mkdir -p "${INSTALL_DIR}"

for NAME in blackboard ivy-blackboard; do
  cat > "${INSTALL_DIR}/${NAME}" << WRAPPER
#!/bin/bash
exec bun ${SCRIPT_DIR}/src/index.ts "\$@"
WRAPPER
  chmod +x "${INSTALL_DIR}/${NAME}"
done

echo "Installed blackboard wrappers → ${INSTALL_DIR}/{blackboard,ivy-blackboard}"
echo "Version: $(${INSTALL_DIR}/blackboard --version)"
