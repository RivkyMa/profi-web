import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and blocks interaction. */
  loading?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> & {
    href?: undefined;
  };

type ButtonAsLink = BaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[linear-gradient(135deg,var(--color-pulse-hi),var(--color-pulse)_55%,var(--color-pulse-deep))] text-ground-0 shadow-glow hover:brightness-110",
  secondary:
    "border border-hair-3 bg-ground-2/60 text-ink-1 hover:border-hair-4 hover:bg-ground-3",
  ghost: "text-ink-2 hover:text-ink-1",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-[15px]",
  lg: "h-[52px] px-8 text-base",
};

function classes(
  variant: ButtonVariant,
  size: ButtonSize,
  inactive: boolean,
  className?: string,
): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none",
    "transition-[transform,background-color,border-color,color,box-shadow,filter] duration-300 ease-premium",
    inactive
      ? "cursor-not-allowed opacity-50"
      : "cursor-pointer motion-safe:active:scale-[0.98]",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

function Content({
  loading,
  leading,
  trailing,
  children,
}: Pick<BaseProps, "loading" | "leading" | "trailing" | "children">) {
  return (
    <>
      {loading ? (
        <LoaderCircle
          aria-hidden
          className="size-4 animate-spin motion-reduce:animate-none"
        />
      ) : (
        leading
      )}
      <span>{children}</span>
      {trailing}
    </>
  );
}

const isExternal = (href: string) => /^(https?:)?\/\//.test(href);

export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const {
      variant = "primary",
      size = "md",
      loading = false,
      disabled = false,
      leading,
      trailing,
      className,
      children,
      href,
      ...anchorProps
    } = props;
    const inactive = disabled || loading;
    const content = (
      <Content loading={loading} leading={leading} trailing={trailing}>
        {children}
      </Content>
    );

    // A disabled link has no destination: render an inert, labelled element.
    if (inactive) {
      return (
        <span
          role="link"
          aria-disabled="true"
          aria-busy={loading || undefined}
          className={classes(variant, size, true, className)}
        >
          {content}
        </span>
      );
    }

    const linkClass = classes(variant, size, false, className);
    return isExternal(href) ? (
      <a
        {...anchorProps}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        {content}
      </a>
    ) : (
      <Link {...anchorProps} href={href} className={linkClass}>
        {content}
      </Link>
    );
  }

  const {
    variant = "primary",
    size = "md",
    loading = false,
    disabled = false,
    leading,
    trailing,
    className,
    children,
    type = "button",
    ...buttonProps
  } = props;
  const inactive = disabled || loading;

  return (
    <button
      {...buttonProps}
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      className={classes(variant, size, inactive, className)}
    >
      <Content loading={loading} leading={leading} trailing={trailing}>
        {children}
      </Content>
    </button>
  );
}
