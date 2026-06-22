interface Props {
  message: string;
}

export function LoadingOverlay({ message }: Props) {
  return (
    <div className="loading-overlay">
      <div className="loading-box">
        <div className="spinner" />
        <p>{message || "Processando..."}</p>
        <small>Consultando Câmara/Senado e enriquecendo CNPJs. Pode levar alguns segundos.</small>
      </div>
    </div>
  );
}
