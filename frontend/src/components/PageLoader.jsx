// Shared Suspense fallback shown while a lazy page/tab chunk loads.
export default function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
      <div className="spinner" aria-label="Loading" style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '3px solid rgba(16,185,129,.2)', borderTopColor: 'var(--primary, #10b981)',
        animation: 'spin .7s linear infinite',
      }} />
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
