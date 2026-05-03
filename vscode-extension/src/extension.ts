import * as vscode from "vscode";
import { SmartAIChatViewProvider } from "./chatViewProvider";

export function activate(context: vscode.ExtensionContext) {
  const provider = new SmartAIChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SmartAIChatViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  function getSelection(): { code: string; language: string; file: string } | null {
    const ed = vscode.window.activeTextEditor;
    if (!ed) return null;
    const sel = ed.document.getText(ed.selection);
    if (!sel.trim()) return null;
    return {
      code: sel,
      language: ed.document.languageId,
      file: vscode.workspace.asRelativePath(ed.document.uri),
    };
  }

  function runWithSelection(intro: string, category = "coding") {
    const sel = getSelection();
    if (!sel) {
      vscode.window.showWarningMessage("SmartAI: select some code first.");
      return;
    }
    const prompt = `${intro}\n\nFile: \`${sel.file}\` (${sel.language})\n\n\`\`\`${sel.language}\n${sel.code}\n\`\`\``;
    provider.sendPrompt(prompt, category);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("smartai.explainCode", () =>
      runWithSelection("Explain this code clearly. Highlight any bugs or smells.")
    ),
    vscode.commands.registerCommand("smartai.generateTests", () =>
      runWithSelection("Generate thorough unit tests for the following code. Use the most idiomatic test framework for the language.")
    ),
    vscode.commands.registerCommand("smartai.fixBug", () =>
      runWithSelection("Find and fix bugs in this code. Return the corrected version with a short explanation of the fix.")
    ),
    vscode.commands.registerCommand("smartai.refactor", () =>
      runWithSelection("Refactor this code for clarity, performance, and best practices. Keep behaviour identical.")
    ),
    vscode.commands.registerCommand("smartai.guidewireQA", () =>
      runWithSelection(
        "Act as a Guidewire QA expert (PolicyCenter / ClaimCenter / BillingCenter). Generate test cases, Gosu/GUnit, Selenium+Java POM, or Cucumber BDD scenarios as appropriate.",
        "guidewire"
      )
    ),
    vscode.commands.registerCommand("smartai.askAboutSelection", async () => {
      const sel = getSelection();
      if (!sel) {
        vscode.window.showWarningMessage("SmartAI: select some code first.");
        return;
      }
      const q = await vscode.window.showInputBox({ prompt: "Ask SmartAI about the selected code" });
      if (!q) return;
      const prompt = `${q}\n\nContext — \`${sel.file}\`:\n\`\`\`${sel.language}\n${sel.code}\n\`\`\``;
      provider.sendPrompt(prompt, "coding");
    }),
    vscode.commands.registerCommand("smartai.newChat", () => {
      vscode.commands.executeCommand("smartai.chatView.focus");
    })
  );
}

export function deactivate() {}