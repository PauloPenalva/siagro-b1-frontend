import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import RequestModel from "siagrob1/model/RequestModel";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService, { AVAILABLE_THEMES, DEFAULT_THEME } from "siagrob1/services/SessionService";
import FileUploader, { FileUploader$ChangeEvent } from "sap/ui/unified/FileUploader";
import { UserProfile } from "siagrob1/types/UserIdentity";

/**
 * Manutenção que o usuário faz na própria conta: foto do avatar, tema e senha.
 *
 * Nome, usuário e e-mail são somente leitura - em modo SAPB1 esses dados vêm do cadastro do SAP
 * (tabela OUSR) e qualquer alteração feita aqui seria desfeita na próxima sincronização.
 *
 * @namespace siagrob1.controller.profile
 */
export default class Main extends CommonController {

  private file?: File;

  onInit(): void {
    this.getRouter().getRoute("profile").attachPatternMatched(() => void this.routeMatched());
  }

  private async routeMatched(): Promise<void> {
    const model = new JSONModel();
    model.setProperty("/availableThemes", AVAILABLE_THEMES);
    this.getView().setModel(model, "profile");

    this.clearPasswordFields();
    this.clearFileUploader();

    await this.loadProfile();
  }

  private async loadProfile(): Promise<void> {
    const model = this.getView().getModel("profile") as JSONModel;

    try {
      this.setBusy(true);

      const profile = await new RequestModel().get<UserProfile>(ServerRoutes.myProfile);

      model.setProperty("/username", profile?.username ?? "");
      model.setProperty("/fullName", profile?.fullName ?? "");
      model.setProperty("/email", profile?.email ?? "");
      model.setProperty("/hasPhoto", profile?.hasPhoto === true);
      model.setProperty("/theme", profile?.theme ?? DEFAULT_THEME);
      model.setProperty("/maintenanceHint", this.maintenanceHint());
      // A regra de senha vem do servidor: é configurável por ambiente.
      model.setProperty("/passwordRequirements", profile?.passwordRequirements ?? "");
    } catch (error) {
      MessageBox.error("Falha ao carregar o perfil.");
      console.warn("Falha ao carregar o perfil.", error);
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Onde alterar nome e e-mail depende do modo de integração: no SAPB1 quem manda é o cadastro do
   * SAP, e dizer "procure o administrador" mandaria o usuário para a pessoa errada.
   */
  private maintenanceHint(): string {
    return SessionService.isSapMode()
      ? "Usuário, nome e e-mail são mantidos no cadastro de usuários do SAP Business One."
      : "Para alterar nome ou e-mail, procure um administrador do sistema.";
  }

  /* ------------------------------------------------------------------ */
  /* Foto                                                                */
  /* ------------------------------------------------------------------ */

  onPhotoSelected(ev: FileUploader$ChangeEvent): void {
    const files = ev.getParameter("files");
    this.file = files?.length > 0 ? files[0] as File : undefined;
  }

  onPhotoTypeMismatch(): void {
    this.file = undefined;
    MessageBox.warning("Formato não suportado. Use PNG, JPEG, GIF ou WEBP.");
  }

  onPhotoTooLarge(): void {
    this.file = undefined;
    MessageBox.warning("A imagem deve ter no máximo 2 MB.");
  }

  async onUploadPhoto(): Promise<void> {
    if (!this.file) {
      MessageBox.warning("Escolha uma imagem antes de enviar.");
      return;
    }

    const file = this.file;

    try {
      this.setBusy(true);

      await new RequestModel().post(ServerRoutes.myPhoto, {
        ContentType: file.type,
        File: await this.toBase64(file)
      });

      this.afterPhotoChanged(true, "Foto atualizada.");
    } catch (error) {
      this.showRequestError(error, "Falha ao enviar a foto.");
    } finally {
      this.setBusy(false);
    }
  }

  async onRemovePhoto(): Promise<void> {
    try {
      this.setBusy(true);

      await new RequestModel().delete(ServerRoutes.myPhoto);

      this.afterPhotoChanged(false, "Foto removida.");
    } catch (error) {
      this.showRequestError(error, "Falha ao remover a foto.");
    } finally {
      this.setBusy(false);
    }
  }

  /** A URL da foto carrega um `?v=`: sem trocá-lo o browser continuaria mostrando a imagem antiga. */
  private afterPhotoChanged(hasPhoto: boolean, message: string): void {
    (this.getView().getModel("profile") as JSONModel).setProperty("/hasPhoto", hasPhoto);
    SessionService.refreshPhoto(hasPhoto);
    this.clearFileUploader();
    MessageToast.show(message);
  }

  private toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = reader.result as string;
        // `readAsDataURL` devolve "data:image/png;base64,AAAA..." - o servidor espera só o conteúdo.
        resolve(result.includes(",") ? result.split(",")[1] : result);
      };
      reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));

      reader.readAsDataURL(file);
    });
  }

  private clearFileUploader(): void {
    this.file = undefined;
    (this.byId("photoUploader") as FileUploader)?.setValue("");
  }

  /* ------------------------------------------------------------------ */
  /* Tema                                                                */
  /* ------------------------------------------------------------------ */

  async onThemeChanged(): Promise<void> {
    const model = this.getView().getModel("profile") as JSONModel;
    const theme = model.getProperty("/theme") as string;

    // Aplicado antes da ida ao servidor: a troca de tema precisa parecer instantânea. Se a
    // gravação falhar, o valor anterior volta junto com o aviso.
    SessionService.applyTheme(theme);

    try {
      // `put` monta o corpo a partir dos dados do próprio RequestModel - passar o payload como
      // segundo argumento cairia no parâmetro `typeData` e enviaria uma requisição vazia.
      await new RequestModel({ Theme: theme }).put(ServerRoutes.myTheme);
    } catch (error) {
      this.showRequestError(error, "Falha ao salvar o tema.");
      await this.loadProfile();
      SessionService.applyTheme(model.getProperty("/theme") as string);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Senha                                                               */
  /* ------------------------------------------------------------------ */

  async onChangePassword(): Promise<void> {
    const model = this.getView().getModel("profile") as JSONModel;
    const currentPassword = model.getProperty("/currentPassword") as string ?? "";
    const newPassword = model.getProperty("/newPassword") as string ?? "";
    const confirmPassword = model.getProperty("/confirmPassword") as string ?? "";

    if (!currentPassword || !newPassword || !confirmPassword) {
      MessageBox.warning("Informe a senha atual, a nova senha e a confirmação.");
      return;
    }

    if (newPassword !== confirmPassword) {
      MessageBox.warning("As senhas não conferem.");
      return;
    }

    try {
      this.setBusy(true);

      await new RequestModel().post(ServerRoutes.changePassword, {
        CurrentPassword: currentPassword,
        NewPassword: newPassword
      });

      this.clearPasswordFields();
      MessageToast.show("Senha alterada com sucesso.");
    } catch (error) {
      this.showRequestError(error, "Falha ao alterar a senha.");
    } finally {
      this.setBusy(false);
    }
  }

  private clearPasswordFields(): void {
    const model = this.getView().getModel("profile") as JSONModel;
    model.setProperty("/currentPassword", "");
    model.setProperty("/newPassword", "");
    model.setProperty("/confirmPassword", "");
  }

  private showRequestError(error: unknown, fallback: string): void {
    const err = error as JQuery.jqXHR;
    MessageBox.error((err?.responseJSON as { message?: string })?.message ?? fallback);
  }
}
