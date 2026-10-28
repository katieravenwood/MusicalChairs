"""Streamlit host for the actual Apps Script UI running on fictional browser memory."""
import streamlit as st
from demo_preview import build_demo

st.set_page_config(page_title='Pit Calendar | Reference demo', page_icon='🎼', layout='wide')
st.title('The people in the pit.')
st.caption('Public calendar · Staffing editor · Calendar administration')
st.info('Fictional demo. Choose a musician or administrator to explore the editor. Edits live only in this page’s memory and reset on reload. No Google login or theatre connection is used.')
st.iframe(build_demo(), height=1150, alt='Interactive public calendar and staffing editor demo')
with st.expander('Deploy your own calendar'):
    st.markdown('Upload this repository to GitHub and use **streamlit_app.py** for the Streamlit demo. For a real theatre, follow **INSTALL.md** and **docs/AUTHENTICATED-EDITOR.md** to deploy Google Sheets and the two Apps Script web apps. The public deployment owns the live subscriptions; the editor links back to it.')
    st.caption('The demo simulates Google services and authorization. It does not grant real workbook permissions or provide a permanent subscription URL. Demo downloads are ICS snapshots.')
