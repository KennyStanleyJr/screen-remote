export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, the user must type this word to confirm. */
  typeToConfirm?: string;
}

interface PinRequest {
  title: string;
  message?: string;
  error?: string;
  resolve: (pin: string | null) => void;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

interface TextOptions {
  allowEmpty?: boolean;
  password?: boolean;
}

interface TextRequest extends TextOptions {
  title: string;
  label: string;
  value: string;
  resolve: (text: string | null) => void;
}

export interface Toast {
  id: number;
  kind: 'ok' | 'error' | 'info';
  text: string;
}

let nextToast = 1;

/** Promise-based sheets (PIN, confirm, text) and toasts shared by the whole app. */
class Ui {
  pin = $state<PinRequest | null>(null);
  confirm = $state<ConfirmRequest | null>(null);
  text = $state<TextRequest | null>(null);
  toasts = $state<Toast[]>([]);

  askPin(title: string, message?: string, error?: string): Promise<string | null> {
    return new Promise((resolve) => {
      this.pin = {
        title,
        message,
        error,
        resolve: (pin) => {
          this.pin = null;
          resolve(pin);
        },
      };
    });
  }

  askConfirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirm = {
        ...options,
        resolve: (ok) => {
          this.confirm = null;
          resolve(ok);
        },
      };
    });
  }

  askText(
    title: string,
    label: string,
    value = '',
    options: TextOptions = {},
  ): Promise<string | null> {
    return new Promise((resolve) => {
      this.text = {
        ...options,
        title,
        label,
        value,
        resolve: (text) => {
          this.text = null;
          resolve(text);
        },
      };
    });
  }

  toast(kind: Toast['kind'], text: string): void {
    const id = nextToast++;
    this.toasts = [...this.toasts, { id, kind, text }];
    setTimeout(() => this.dismiss(id), kind === 'error' ? 6000 : 3000);
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const ui = new Ui();
