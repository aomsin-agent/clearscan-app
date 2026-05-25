export function Spinner({ size = 56 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <div
        className="rounded-full border-4 border-muted animate-spin"
        style={{
          width: size,
          height: size,
          borderTopColor: "var(--color-primary)",
          borderRightColor: "color-mix(in oklab, var(--color-primary) 60%, transparent)",
        }}
      />
    </div>
  );
}
