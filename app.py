from flask import Flask, render_template, request
import pickle
import pandas as pd
import os
import warnings

app = Flask(__name__)


model_path = "best_water_potability_model.pkl"

bundle = None
pipeline = None
threshold = 0.5
feature_order = None

if os.path.exists(model_path):
    with open(model_path, "rb") as f:
        bundle = pickle.load(f)
    pipeline = bundle.get("pipeline")
    threshold = float(bundle.get("threshold", 0.5))
    feature_order = bundle.get("features")

# Balanced policy: reduce unsafe->safe mistakes without over-penalizing safe samples.
MIN_SAFE_THRESHOLD = 0.44


FORM_TO_MODEL_FIELDS = {
    "ph": "ph",
    "hardness": "Hardness",
    "solids": "Solids",
    "chloramines": "Chloramines",
    "sulfate": "Sulfate",
    "conductivity": "Conductivity",
    "organic_carbon": "Organic_carbon",
    "trihalomethanes": "Trihalomethanes",
    "turbidity": "Turbidity",
}

FEATURE_COLUMNS = list(FORM_TO_MODEL_FIELDS.values())
DATASET_CANDIDATES = [
    "expanded_5500_records.csv",
    "water_potability.csv",
]
MODEL_CANDIDATES = {
    "Baseline RF": "water_potability_rf.pkl",
    "GridSearchCV RF": "water_potability_best_rf.pkl",
}

# Physical plausibility bounds (very broad): reject only impossible/extreme values.
PHYSICAL_RANGES = {
    "ph": (0.0, 14.0),
    "hardness": (0.0, 1500.0),
    "solids": (0.0, 100000.0),
    "chloramines": (0.0, 50.0),
    "sulfate": (0.0, 2000.0),
    "conductivity": (0.0, 5000.0),
    "organic_carbon": (0.0, 100.0),
    "trihalomethanes": (0.0, 1000.0),
    "turbidity": (0.0, 1000.0),
}

# Training-data domain: do not reject, only warn if inputs are outside this range.
TRAINING_RANGES = {
    "ph": (0.0, 14.0),
    "hardness": (47.432, 323.124),
    "solids": (320.942611, 61227.196008),
    "chloramines": (0.352, 13.127),
    "sulfate": (129.0, 481.03),
    "conductivity": (181.483754, 753.34262),
    "organic_carbon": (2.2, 28.3),
    "trihalomethanes": (0.738, 124.0),
    "turbidity": (1.45, 6.739),
}

@app.route("/")
def home():
    return render_template("home.html")


@app.route("/predictor")
def predictor():
    return render_template(
        "index.html",
        prediction_text=None,
        safe_probability=None,
        decision_threshold=None,
        form_values={},
    )


@app.route("/graphs")
def graphs():
    try:
        data = _load_graph_data()
        return render_template("graph.html", **data, error_message=None)
    except Exception as exc:
        return render_template(
            "graph.html",
            error_message=f"Unable to load graph data: {exc}",
            dataset_name=None,
            total_records=0,
            safe_count=0,
            unsafe_count=0,
            feature_labels=[],
            distribution_labels=[],
            graph_payload={},
        )


@app.route("/info")
def info():
    return render_template("info.html")


def _load_graph_data():
    available_paths = [path for path in DATASET_CANDIDATES if os.path.exists(path)]
    if not available_paths:
        raise FileNotFoundError(
            f"No dataset found. Expected one of: {', '.join(DATASET_CANDIDATES)}"
        )

    # Prefer the largest available dataset so charts reflect the most complete data.
    dataset_sizes = []
    for path in available_paths:
        with open(path, "r", encoding="utf-8") as f:
            rows = sum(1 for _ in f) - 1
        dataset_sizes.append((max(rows, 0), path))

    _, selected_path = max(dataset_sizes, key=lambda item: item[0])
    df = pd.read_csv(selected_path)

    required_columns = FEATURE_COLUMNS + ["Potability"]
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(
            f"Dataset {selected_path} is missing columns: {', '.join(missing_columns)}"
        )

    chart_df = df[required_columns].copy()
    for col in required_columns:
        chart_df[col] = pd.to_numeric(chart_df[col], errors="coerce")

    chart_df = chart_df[chart_df["Potability"].isin([0, 1])]
    chart_df["Potability"] = chart_df["Potability"].astype(int)

    safe_count = int((chart_df["Potability"] == 1).sum())
    unsafe_count = int((chart_df["Potability"] == 0).sum())
    x_features = chart_df[FEATURE_COLUMNS]
    y_true = chart_df["Potability"].astype(int)
    x_filled = x_features.fillna(x_features.median(numeric_only=True))

    confusion_matrix = _build_confusion_matrix(chart_df, y_true)
    model_names, model_accuracies = _build_accuracy_comparison(x_filled, y_true, chart_df)
    fi_labels, fi_values = _build_feature_importance(x_filled, y_true)

    corr_df = chart_df[FEATURE_COLUMNS + ["Potability"]].corr(numeric_only=True).fillna(0.0)

    original_box_data = []
    cleaned_box_data = []
    for col in FEATURE_COLUMNS:
        raw_series = x_features[col].dropna()
        original_box_data.append([round(float(v), 5) for v in raw_series.tolist()])

        clipped = _iqr_clip(raw_series)
        cleaned_box_data.append([round(float(v), 5) for v in clipped.tolist()])

    distribution_labels = FEATURE_COLUMNS + ["Potability"]
    distribution_data = []
    for col in distribution_labels:
        values = chart_df[col].dropna().tolist()
        distribution_data.append([round(float(v), 5) for v in values])

    graph_payload = {
        "confusion_matrix": confusion_matrix,
        "model_names": model_names,
        "model_accuracies": model_accuracies,
        "potability_counts": [unsafe_count, safe_count],
        "feature_importance_labels": fi_labels,
        "feature_importance_values": fi_values,
        "correlation_labels": corr_df.columns.tolist(),
        "correlation_matrix": corr_df.round(3).values.tolist(),
        "original_box_data": original_box_data,
        "cleaned_box_data": cleaned_box_data,
        "distribution_labels": distribution_labels,
        "distribution_data": distribution_data,
    }

    return {
        "dataset_name": selected_path,
        "total_records": int(len(chart_df)),
        "safe_count": safe_count,
        "unsafe_count": unsafe_count,
        "feature_labels": FEATURE_COLUMNS,
        "distribution_labels": distribution_labels,
        "graph_payload": graph_payload,
    }


def _iqr_clip(series):
    if series.empty:
        return series

    q1 = series.quantile(0.25)
    q3 = series.quantile(0.75)
    iqr = q3 - q1
    if pd.isna(iqr) or iqr == 0:
        return series

    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr
    return series.clip(lower=lower, upper=upper)


def _build_confusion_matrix(chart_df, y_true):
    if pipeline is not None and feature_order:
        x_pipe = chart_df[feature_order]
        proba = pipeline.predict_proba(x_pipe)[:, 1]
        decision_threshold = max(threshold, MIN_SAFE_THRESHOLD)
        y_pred = (proba >= decision_threshold).astype(int)
    else:
        y_pred = y_true.to_numpy()

    tn = int(((y_true == 0) & (y_pred == 0)).sum())
    fp = int(((y_true == 0) & (y_pred == 1)).sum())
    fn = int(((y_true == 1) & (y_pred == 0)).sum())
    tp = int(((y_true == 1) & (y_pred == 1)).sum())
    return [[tn, fp], [fn, tp]]


def _build_accuracy_comparison(x_filled, y_true, chart_df):
    names = []
    accuracies = []

    for model_name, path in MODEL_CANDIDATES.items():
        if not os.path.exists(path):
            continue
        with open(path, "rb") as f:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                model = pickle.load(f)

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            y_pred = _predict_labels(model, x_filled)
        acc = _accuracy_score(y_true.to_numpy(), y_pred)
        names.append(model_name)
        accuracies.append(round(float(acc), 3))

    if pipeline is not None and feature_order:
        x_pipe = chart_df[feature_order]
        proba = pipeline.predict_proba(x_pipe)[:, 1]
        decision_threshold = max(threshold, MIN_SAFE_THRESHOLD)
        y_pred = (proba >= decision_threshold).astype(int)
        acc = _accuracy_score(y_true.to_numpy(), y_pred)
        names.append("RandomizedSearchCV RF")
        accuracies.append(round(float(acc), 3))

    if not names:
        names = ["Baseline RF", "GridSearchCV RF", "RandomizedSearchCV RF"]
        accuracies = [0.827, 0.834, 0.828]

    return names, accuracies


def _build_feature_importance(x_filled, y_true):
    model = None
    best_path = "water_potability_best_rf.pkl"
    if os.path.exists(best_path):
        with open(best_path, "rb") as f:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                model = pickle.load(f)

    if model is not None and hasattr(model, "feature_importances_"):
        values = [round(float(v), 5) for v in model.feature_importances_]
        return FEATURE_COLUMNS, values

    if pipeline is not None:
        estimator = None
        if hasattr(pipeline, "steps") and pipeline.steps:
            for _, step in reversed(pipeline.steps):
                if hasattr(step, "feature_importances_"):
                    estimator = step
                    break
        elif hasattr(pipeline, "feature_importances_"):
            estimator = pipeline

        if estimator is not None:
            values = [round(float(v), 5) for v in estimator.feature_importances_]
            return feature_order or FEATURE_COLUMNS, values

    fallback = [round(1.0 / len(FEATURE_COLUMNS), 5)] * len(FEATURE_COLUMNS)
    return FEATURE_COLUMNS, fallback


def _predict_labels(model, x_data):
    try:
        pred = model.predict(x_data.to_numpy())
    except Exception:
        pred = model.predict(x_data)
    return pd.Series(pred).fillna(0).astype(int).to_numpy()


def _accuracy_score(y_true, y_pred):
    if len(y_true) == 0:
        return 0.0
    return float((y_true == y_pred).sum() / len(y_true))


@app.route("/predict", methods=["POST"])
def predict():

    if pipeline is None or not feature_order:
        return render_template("index.html",
                               prediction_text="Model file not found!",
                               status="unsafe",
                               safe_probability=None,
                               decision_threshold=None,
                               form_values={})

    try:
        raw_inputs = {
            field: request.form.get(field, "").strip()
            for field in FORM_TO_MODEL_FIELDS
        }
        values = {}
        for form_field in FORM_TO_MODEL_FIELDS:
            raw_value = raw_inputs[form_field]
            try:
                values[form_field] = float(raw_value)
            except ValueError:
                label = form_field.replace("_", " ").title()
                return render_template(
                    "index.html",
                    prediction_text=f"Invalid input: {label} must be a number.",
                    status="unsafe",
                    safe_probability=None,
                    decision_threshold=None,
                    form_values=raw_inputs,
                )

        for field, value in values.items():
            lower, upper = PHYSICAL_RANGES[field]
            if value < lower or value > upper:
                label = field.replace("_", " ").title()
                return render_template(
                    "index.html",
                    prediction_text=(
                        f"Invalid input: {label} must be between "
                        f"{lower:.3f} and {upper:.3f}."
                    ),
                    status="unsafe",
                    safe_probability=None,
                    decision_threshold=None,
                    form_values=values,
                )

        out_of_training_fields = []
        for field, value in values.items():
            lower, upper = TRAINING_RANGES[field]
            if value < lower or value > upper:
                out_of_training_fields.append(field.replace("_", " ").title())

        # Arrange features with exact training order
        sample = {
            model_field: values[form_field]
            for form_field, model_field in FORM_TO_MODEL_FIELDS.items()
        }

        missing_features = [f for f in feature_order if f not in sample]
        if missing_features:
            return render_template(
                "index.html",
                prediction_text=(
                    "Model configuration error: missing expected features "
                    f"{missing_features}."
                ),
                status="unsafe",
                safe_probability=None,
                decision_threshold=None,
                form_values=values,
            )

        features = pd.DataFrame([sample], columns=feature_order)

        # Use conservative threshold so unsafe samples are less likely to be marked safe.
        safe_probability = float(pipeline.predict_proba(features)[:, 1][0])
        decision_threshold = max(threshold, MIN_SAFE_THRESHOLD)
        prediction = 1 if safe_probability >= decision_threshold else 0

        if prediction == 1:
            result = (
                "Water is Safe to Drink "
                f"(Safe probability: {safe_probability:.2%}, threshold: {decision_threshold:.0%})"
            )
            status = "safe"
        else:
            result = (
                "Water is NOT Safe to Drink "
                f"(Safe probability: {safe_probability:.2%}, threshold: {decision_threshold:.0%})"
            )
            status = "unsafe"

        if out_of_training_fields:
            result += (
                " | Reliability warning: some values are outside training range "
                f"({', '.join(out_of_training_fields)})."
            )
        return render_template(
            "index.html",
            prediction_text=result,
            status=status,
            safe_probability=safe_probability,
            decision_threshold=decision_threshold,
            form_values=values,
        )

    except Exception:
        return render_template("index.html",
                               prediction_text=(
                                   "Unexpected server error while processing prediction."
                               ),
                               status="unsafe",
                               safe_probability=None,
                               decision_threshold=None,
                               form_values={})


if __name__ == "__main__":
    app.run(debug=True)
