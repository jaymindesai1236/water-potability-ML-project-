from flask import Flask, render_template, request
import pickle
import numpy as np
import os

app = Flask(__name__)

# Load model
model_path = "water_potability_best_rf.pkl"
scaler_path = "scaler.pkl"

model = None
scaler = None

if os.path.exists(model_path):
    with open(model_path, "rb") as f:
        model = pickle.load(f)

if os.path.exists(scaler_path):
    with open(scaler_path, "rb") as f:
        scaler = pickle.load(f)


@app.route("/")
def home():
    return render_template("index.html", prediction_text=None)


@app.route("/predict", methods=["POST"])
def predict():

    if model is None:
        return render_template("index.html",
                               prediction_text="Model file not found!")

    try:
        # Get form values
        ph = float(request.form["ph"])
        hardness = float(request.form["hardness"])
        solids = float(request.form["solids"])
        chloramines = float(request.form["chloramines"])
        sulfate = float(request.form["sulfate"])
        conductivity = float(request.form["conductivity"])
        organic_carbon = float(request.form["organic_carbon"])
        trihalomethanes = float(request.form["trihalomethanes"])
        turbidity = float(request.form["turbidity"])

        # Arrange features
        features = np.array([[ph, hardness, solids, chloramines,
                              sulfate, conductivity,
                              organic_carbon, trihalomethanes,
                              turbidity]])

        # Apply scaling if scaler exists
        if scaler:
            features = scaler.transform(features)

        # Prediction
        prediction = model.predict(features)[0]

        if prediction == 1:
            result = "Water is Safe to Drink"
            status = "safe"
        else:
            result = "Water is NOT Safe to Drink"
            status = "unsafe"

        return render_template("index.html",
                               prediction_text=result,
                               status=status)

    except Exception as e:
        return render_template("index.html",
                               prediction_text=f"Error: {str(e)}")


if __name__ == "__main__":
    app.run(debug=True)