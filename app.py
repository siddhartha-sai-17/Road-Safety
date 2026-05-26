import io
import os
from datetime import datetime

import numpy as np
import streamlit as st
from PIL import Image

try:
    import tensorflow as tf
except ImportError:
    tf = None

MODEL_PATH = "road_damage_model.keras"
CLASS_NAMES = ["Pothole", "Crack", "Manhole"]
COLOR_MAP = {"Pothole": "#d85a30", "Crack": "#ba7517", "Manhole": "#185fa5"}


def load_model():
    if tf is None:
        return None

    if not os.path.exists(MODEL_PATH):
        return None

    try:
        return tf.keras.models.load_model(MODEL_PATH)
    except Exception:
        return None


@st.cache_resource
def get_model():
    return load_model()


def get_severity(confidence: float) -> str:
    if confidence < 60:
        return "Low"
    if confidence < 80:
        return "Medium"
    return "High"


def get_recommendations(damage_type: str, severity: str) -> list:
    guidance = {
        "Pothole": {
            "High": {
                "type": "danger",
                "title": "Immediate maintenance required",
                "body": "Schedule emergency repair, place warning signage, and monitor for further expansion.",
            },
            "Medium": {
                "type": "warning",
                "title": "Priority maintenance suggested",
                "body": "Patch the area within a week, inspect surrounding deterioration, and document location.",
            },
            "Low": {
                "type": "info",
                "title": "Routine monitoring recommended",
                "body": "Add the location to scheduled inspections and plan repair for the next cycle.",
            },
        },
        "Crack": {
            "High": {
                "type": "danger",
                "title": "Urgent crack repair needed",
                "body": "Inspect immediately, apply sealing, and restrict heavy-vehicle traffic.",
            },
            "Medium": {
                "type": "warning",
                "title": "Scheduled maintenance recommended",
                "body": "Plan crack sealing and monitor pavement closely.",
            },
            "Low": {
                "type": "info",
                "title": "Preventive check advised",
                "body": "Track the crack and keep drainage clear for the next inspection cycle.",
            },
        },
        "Manhole": {
            "High": {
                "type": "danger",
                "title": "Critical manhole hazard",
                "body": "Secure the location, coordinate utility repair, and replace the cover immediately.",
            },
            "Medium": {
                "type": "warning",
                "title": "Important maintenance needed",
                "body": "Inspect the frame and cover within days and schedule alignment work.",
            },
            "Low": {
                "type": "info",
                "title": "Routine manhole observation",
                "body": "Log the condition and include it in the next inspection round.",
            },
        },
    }
    return [
        guidance.get(damage_type, {}).get(severity, {
            "type": "info",
            "title": "Standard inspection recommended",
            "body": "Monitor the road condition and schedule maintenance if the issue worsens.",
        })
    ]


def predict(image: Image.Image):
    model = get_model()
    if model is None:
        probabilities = np.random.dirichlet([1.0, 1.0, 1.0])
        probabilities = probabilities / probabilities.sum()
        top_index = int(np.argmax(probabilities))
        return CLASS_NAMES[top_index], float(np.max(probabilities) * 100), probabilities

    image = image.convert("RGB")
    image = image.resize((224, 224))
    arr = np.array(image, dtype=np.float32)
    arr = np.expand_dims(arr, 0)
    predictions = model.predict(arr, verbose=0)
    probabilities = np.squeeze(predictions)
    probabilities = probabilities / probabilities.sum()
    top_index = int(np.argmax(probabilities))
    return CLASS_NAMES[top_index], float(probabilities[top_index] * 100), probabilities


def render_probability_bars(probabilities):
    for label, prob in zip(CLASS_NAMES, probabilities):
        pct = prob * 100
        bar_html = f"""
            <div style='margin-bottom: 12px;'>
              <div style='display:flex; justify-content:space-between; font-size:12px; color:#4b4a45;'><span>{label}</span><span>{pct:.1f}%</span></div>
              <div style='background:#f0efe9; border-radius:6px; overflow:hidden; height:12px;'>
                <div style='width:{pct:.1f}%; background:{COLOR_MAP[label]}; height:100%; border-radius:6px;'></div>
              </div>
            </div>
        """
        st.markdown(bar_html, unsafe_allow_html=True)


def initialize_session_state():
    if "history" not in st.session_state:
        st.session_state.history = []


def add_history_item(image_bytes, prediction, confidence, severity):
    item = {
        "image_bytes": image_bytes,
        "prediction": prediction,
        "confidence": f"{confidence:.1f}%",
        "severity": severity,
        "timestamp": datetime.now().strftime("%H:%M:%S"),
    }
    st.session_state.history.insert(0, item)
    if len(st.session_state.history) > 10:
        st.session_state.history = st.session_state.history[:10]


def main():
    st.set_page_config(page_title="Smart Road Safety", page_icon="🛣️", layout="wide")

    initialize_session_state()

    with st.sidebar:
        st.markdown("## RoadScan v2.0")
        st.markdown("### Active model")
        st.markdown("EfficientNetB0")
        st.markdown("---")
        st.markdown("**Model status**")
        if get_model() is None:
            st.error("Demo mode — model unavailable")
        else:
            st.success("Model ready")
        st.markdown("---")
        st.markdown("### Damage classes")
        st.write("- Pothole")
        st.write("- Crack")
        st.write("- Manhole")
        st.markdown("---")
        st.markdown("## Detection history")
        if st.session_state.history:
            for item in st.session_state.history:
                st.image(item["image_bytes"], width=120)
                st.markdown(f"**{item['prediction']}** — {item['severity']}")
                st.markdown(f"{item['confidence']} · {item['timestamp']}")
                st.markdown("---")
        else:
            st.write("No detections yet in this session.")

    st.title("🛣️ AI-Based Road Damage Detection System")
    st.write("Upload a road image to classify damage type, confidence level, and get repair recommendations.")

    col1, col2, col3 = st.columns(3)
    col1.metric("Training images", "2,009")
    col2.metric("Damage classes", "3")
    col3.metric("Input resolution", "224px")

    with st.expander("About the project", expanded=True):
        st.markdown("**Why road monitoring matters:** Deteriorating roads cost billions, increase accidents, and harm vehicles. AI enables scalable inspection and early repair planning.")
        st.markdown("**Role of CNNs:** Convolutional Neural Networks learn visual patterns like edges, textures, and crack geometry, making them ideal for road damage detection.")
        st.markdown("**Applications:** Smart city monitoring, insurance damage assessment, autonomous vehicle hazard detection, and maintenance scheduling.")

    uploaded_file = st.file_uploader("Upload a road image", type=["png", "jpg", "jpeg"], accept_multiple_files=False)
    if uploaded_file is not None:
        image_bytes = uploaded_file.getvalue()
        image = Image.open(io.BytesIO(image_bytes))

        st.image(image, caption="Uploaded road image", use_column_width=True)

        if st.button("Run detection"):
            with st.spinner("Running prediction..."):
                prediction, confidence, probabilities = predict(image)
                severity = get_severity(confidence)
                add_history_item(image_bytes, prediction, confidence, severity)

                st.subheader("Detection result")
                result_cols = st.columns(3)
                result_cols[0].metric("Damage type", prediction)
                result_cols[1].metric("Confidence", f"{confidence:.1f}%")
                result_cols[2].metric("Severity", severity)

                st.markdown("### Class confidence")
                render_probability_bars(probabilities)

                st.markdown("### Recommendations")
                recommendations = get_recommendations(prediction, severity)
                for rec in recommendations:
                    if rec["type"] == "danger":
                        st.error(f"**{rec['title']}**\n{rec['body']}")
                    elif rec["type"] == "warning":
                        st.warning(f"**{rec['title']}**\n{rec['body']}")
                    else:
                        st.info(f"**{rec['title']}**\n{rec['body']}")

                if get_model() is None:
                    st.warning("Model file not found or TensorFlow unavailable. Demo predictions are being used.")


if __name__ == "__main__":
    main()
