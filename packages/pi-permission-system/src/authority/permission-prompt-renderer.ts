import type { PermissionPromptDecision, RequestPermissionOptions } from "#src/authority/permission-dialog";
import type { PermissionPromptView } from "#src/authority/permission-prompt-component";
import type { PromptPermissionDetails } from "#src/authority/permission-prompter";

/**
 * A prompt renderer replaces the stock PermissionPromptComponent UI at the
 * terminal prompt level. The package remains the sole authority: the renderer
 * only owns presentation and resolves the user's choice into a
 * PermissionPromptDecision; the package commits that decision via GateRunner /
 * SessionRules exactly as it does for the stock prompt.
 *
 * The renderer is handed the same arguments the stock LocalUserAuthorizer
 * would have passed to requestPermissionDecision:
 *   - details: the ask details (toolName, path, command, forwarding, etc.)
 *   - view: the TUI view (mode, ui, doublePressToConfirm) selected at activation
 *   - title/message/options: the human prompt strings derived from details
 *
 * The renderer must return a PermissionPromptDecision:
 *   - {approved:true, state:"approved"} for Y/Allow
 *   - {approved:false, state:"denied", reason?} for N/Deny or R deny(reason)
 *   - {approved:false, state:"denied", reason:"cancelled"} for Esc/Ctrl+C
 * Session approval (approved_for_session) remains a stock-only path; the
 * renderer should not synthesize it. For the desired Harness UX, Y→approved
 * and N/R/Esc→denied are sufficient; S (session) is intentionally omitted.
 *
 * The renderer is invoked only for LocalUserAuthorizer (interactive local
 * session). ParentAuthorizer (subagent forward) and DenyingAuthorizer
 * (headless/no-authority) never use it.
 */
export type PermissionPromptRenderer = (
  details: PromptPermissionDetails,
  view: PermissionPromptView,
  title: string,
  message: string,
  options?: RequestPermissionOptions,
) => Promise<PermissionPromptDecision>;

/**
 * Single-owner, disposable registry for the terminal prompt renderer.
 *
 * Only one renderer may be registered at a time — a second call throws,
 * mirroring AuthorizerRegistry. The package's LocalUserAuthorizer checks
 * this registry before falling back to the stock requestPermissionDecision.
 * When no renderer is registered, the stock PermissionPromptComponent is used,
 * preserving package compatibility.
 */
export class PermissionPromptRendererRegistry {
  private renderer: PermissionPromptRenderer | null = null;

  register(renderer: PermissionPromptRenderer): () => void {
    if (this.renderer !== null) {
      throw new Error("A permission prompt renderer is already registered");
    }
    this.renderer = renderer;
    return () => {
      if (this.renderer === renderer) {
        this.renderer = null;
      }
    };
  }

  get(): PermissionPromptRenderer | null {
    return this.renderer;
  }
}
