import MessageBox from "sap/m/MessageBox";

const confirmDialog = (message: string, title?: string): Promise<boolean> =>  {
		return new Promise((resolve) => {
			MessageBox.confirm(message, {
				title: title,
				actions: ["NO","YES"],
				emphasizedAction: "YES",
				onClose: (action: string)=> {
					if (action == "YES") {
						resolve(true)
					}
					resolve(false);
				}
			})
		})
	}

  export {
    confirmDialog
  }
