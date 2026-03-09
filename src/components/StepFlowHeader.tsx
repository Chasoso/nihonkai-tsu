import cameraIcon from "../assets/step-camera.png";
import confirmIcon from "../assets/step-confirm.png";
import postIcon from "../assets/step-post.png";

type ComposerStep = 1 | 2 | 3;

interface StepFlowHeaderProps {
  currentStep: ComposerStep;
  step1Complete: boolean;
  step2Complete: boolean;
  onStepChange: (step: ComposerStep) => void;
}

interface StepCardProps {
  step: ComposerStep;
  disabled: boolean;
  onClick: (step: ComposerStep) => void;
}

function StepCard({ step, disabled, onClick }: StepCardProps) {
  return (
    <button type="button" className="step-flow-hit" disabled={disabled} onClick={() => onClick(step)} />
  );
}

export function StepFlowHeader({ currentStep, step1Complete, step2Complete, onStepChange }: StepFlowHeaderProps) {
  const flowLabel = "\u6295\u7a3f\u30d5\u30ed\u30fc";
  const photoLabel = "\u5199\u771f";
  const confirmLabel = "\u9b5a\u3092\u78ba\u8a8d";
  const postLabel = "\u6295\u7a3f";
  const photoAlt = "\u5199\u771f\u30b9\u30c6\u30c3\u30d7\u306e\u30a2\u30a4\u30b3\u30f3";
  const confirmAlt = "\u9b5a\u78ba\u8a8d\u30b9\u30c6\u30c3\u30d7\u306e\u30a2\u30a4\u30b3\u30f3";
  const postAlt = "\u6295\u7a3f\u30b9\u30c6\u30c3\u30d7\u306e\u30a2\u30a4\u30b3\u30f3";
  const gray = "#d8dbe0";
  const blue = "#1d4ed8";
  const textGray = "#9aa0a9";
  const stepColors = [
    currentStep === 1 ? blue : gray,
    currentStep === 2 ? blue : gray,
    currentStep === 3 ? blue : gray
  ];

  const steps: Array<{
    step: ComposerStep;
    label: string;
    iconSrc: string;
    iconAlt: string;
    disabled: boolean;
    metaX: number;
    labelX: number;
  }> = [
    {
      step: 1,
      label: photoLabel,
      iconSrc: cameraIcon,
      iconAlt: photoAlt,
      disabled: false,
      metaX: 200,
      labelX: 200
    },
    {
      step: 2,
      label: confirmLabel,
      iconSrc: confirmIcon,
      iconAlt: confirmAlt,
      disabled: !step1Complete,
      metaX: 570,
      labelX: 570
    },
    {
      step: 3,
      label: postLabel,
      iconSrc: postIcon,
      iconAlt: postAlt,
      disabled: !step2Complete,
      metaX: 970,
      labelX: 970
    }
  ];

  return (
    <div className="step-flow-header" aria-label={flowLabel}>
      <div className="step-flow-stage" role="group" aria-label={flowLabel}>
        <svg className="step-flow-svg" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <path d="M0 0H300L384 110L300 220H0Z" fill={stepColors[0]} />
          <path d="M346 0H700L784 110L700 220H346L430 110Z" fill={stepColors[1]} />
          <path d="M746 0H1100L1184 110L1100 220H746L830 110Z" fill={stepColors[2]} />

          {steps.map((item) => {
            const isActive = currentStep === item.step;
            const metaFill = isActive ? "#ffffff" : textGray;
            const labelFill = isActive ? "#ffffff" : textGray;
            return (
              <g key={`text-${item.step}`}>
                <text
                  x={item.metaX}
                  y="78"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="step-flow-svg-meta"
                  fill={metaFill}
                >
                  {item.step}/3
                </text>
                <text
                  x={item.labelX}
                  y="146"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="step-flow-svg-label"
                  fill={labelFill}
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="step-flow-hit-row">
          {steps.map((item) => (
            <StepCard
              key={item.step}
              step={item.step}
              disabled={item.disabled}
              onClick={onStepChange}
            />
          ))}
        </div>
      </div>
      <div className="step-flow-icon-row" aria-hidden="true">
        {steps.map((item) => (
          <div key={`icon-${item.step}`} className={`step-flow-icon-wrap step-flow-icon-wrap-${item.step}`}>
            <div className={currentStep === item.step ? "step-flow-icon step-flow-icon-active" : "step-flow-icon"}>
              <img src={item.iconSrc} alt={item.iconAlt} className="step-flow-icon-image" loading="lazy" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
