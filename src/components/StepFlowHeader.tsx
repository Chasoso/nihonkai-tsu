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
  ariaLabel: string;
  onClick: (step: ComposerStep) => void;
}

function StepCard({ step, disabled, ariaLabel, onClick }: StepCardProps) {
  return (
    <button
      type="button"
      className="step-flow-hit"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={() => onClick(step)}
    />
  );
}

export function StepFlowHeader({ currentStep, step1Complete, step2Complete, onStepChange }: StepFlowHeaderProps) {
  const flowLabel = "投稿フロー";
  const gray = "#d8dbe0";
  const blue = "#1d4ed8";
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
    centerX: number;
    textWidth: string;
    ariaLabel: string;
  }> = [
    {
      step: 1,
      label: "写真",
      iconSrc: cameraIcon,
      iconAlt: "写真ステップのアイコン",
      disabled: false,
      centerX: 176,
      textWidth: "26%",
      ariaLabel: "1/3 写真"
    },
    {
      step: 2,
      label: "魚を確認",
      iconSrc: confirmIcon,
      iconAlt: "魚確認ステップのアイコン",
      disabled: !step1Complete,
      centerX: 562,
      textWidth: "30%",
      ariaLabel: "2/3 魚を確認"
    },
    {
      step: 3,
      label: "投稿",
      iconSrc: postIcon,
      iconAlt: "投稿ステップのアイコン",
      disabled: !step2Complete,
      centerX: 950,
      textWidth: "24%",
      ariaLabel: "3/3 投稿"
    }
  ];

  return (
    <div className="step-flow-header" aria-label={flowLabel}>
      <div className="step-flow-stage" role="group" aria-label={flowLabel}>
        <svg className="step-flow-svg" viewBox="0 0 1200 220" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 0H300L384 110L300 220H0Z" fill={stepColors[0]} />
          <path d="M346 0H700L784 110L700 220H346L430 110Z" fill={stepColors[1]} />
          <path d="M746 0H1100L1184 110L1100 220H746L830 110Z" fill={stepColors[2]} />
        </svg>
        <div className="step-flow-text-row" aria-hidden="true">
          {steps.map((item) => {
            const isActive = currentStep === item.step;
            return (
              <div
                key={`text-${item.step}`}
                className="step-flow-text"
                style={{ left: `${(item.centerX / 1200) * 100}%`, width: item.textWidth }}
              >
                <span className={isActive ? "step-flow-step-number step-flow-step-number-active" : "step-flow-step-number"}>
                  {item.step}/3
                </span>
                <span className={isActive ? "step-flow-step-label step-flow-step-label-active" : "step-flow-step-label"}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="step-flow-hit-row">
          {steps.map((item) => (
            <StepCard
              key={item.step}
              step={item.step}
              disabled={item.disabled}
              ariaLabel={item.ariaLabel}
              onClick={onStepChange}
            />
          ))}
        </div>
      </div>
      <div className="step-flow-icon-row" aria-hidden="true">
        {steps.map((item) => (
          <div
            key={`icon-${item.step}`}
            className={`step-flow-icon-wrap step-flow-icon-wrap-${item.step}`}
            style={{ left: `${(item.centerX / 1200) * 100}%` }}
          >
            <div className={currentStep === item.step ? "step-flow-icon step-flow-icon-active" : "step-flow-icon"}>
              <img src={item.iconSrc} alt={item.iconAlt} className="step-flow-icon-image" loading="lazy" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
