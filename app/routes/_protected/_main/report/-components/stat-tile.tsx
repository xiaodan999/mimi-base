export default function StatTile({
    label,
    value,
}: {
    label: string;
    value: string | number;
}) {
    return (
        <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-soft">
            <p className="truncate text-lg font-semibold tabular-nums">
                {value}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
        </div>
    );
}
